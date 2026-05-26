export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  const model = (process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5').trim();
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' });

  try {
    const { imageBase64, mimeType, reviewType, brandName, purpose, benefit, cta, memo, specCheck, directorType } = req.body || {};
    if (!imageBase64 || !mimeType) return res.status(400).json({ error: '이미지가 없습니다.' });

    const directorProfiles = {
      A: { name: '완성도 디렉터', desc: '마감감과 디테일 최우선.', focus: '완성도와 마감감을 가장 엄격하게 검수한다.' },
      B: { name: '브랜드 디렉터', desc: '브랜드 톤과 무드 최우선.', focus: '브랜드 톤과 무드를 가장 엄격하게 검수한다.' },
      C: { name: '구조 디렉터', desc: 'TV 시청 환경과 정보 위계 최우선.', focus: 'TV 시청 환경 적합성과 정보 위계를 가장 엄격하게 검수한다.' },
    };
    const dp = directorProfiles[directorType] || directorProfiles.A;

    const prompt = `TV service design pre-review. Director: ${dp.name}. Priority: ${dp.focus}

Review info: type=${reviewType||'?'}, brand=${brandName||'?'}, purpose=${purpose||'?'}, benefit=${benefit||'?'}, cta=${cta||'?'}, memo=${memo||'none'}, spec=${JSON.stringify(specCheck||{})}

Return ONLY a JSON object (no markdown, no code fences). Use Korean for all text values. Structure:
{
  "verdict": "치명 리스크",
  "directorType": "${directorType||'A'}",
  "summary": ["요약1", "요약2"],
  "markers": [
    {"id":1,"x":30,"y":40,"severity":"critical","label":"제목","comment":"설명"}
  ],
  "sections": [
    {"id":"tv","title":"TV 시청 환경 적합성","verdict":"치명 리스크","cause":"복합 리스크","problem":"문제","reason":"이유","suggestion":"제안","markerIds":[1]},
    {"id":"hierarchy","title":"정보 위계","verdict":"수정 권장","cause":"기획/UX 구조 리스크","problem":"문제","reason":"이유","suggestion":"제안","markerIds":[]},
    {"id":"brand","title":"브랜드 톤 유지","verdict":"검토 필요","cause":null,"problem":"문제","reason":"이유","suggestion":"제안","markerIds":[]},
    {"id":"finish","title":"완성도 / 마감감","verdict":"수정 권장","cause":null,"problem":"문제","reason":"이유","suggestion":"제안","markerIds":[]}
  ],
  "priorities": ["1순위","2순위","3순위"],
  "finalComment": "코멘트"
}
severity must be: critical, warning, or info. verdict must be: 치명 리스크, 수정 권장, 검토 필요, or 양호.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 2500,
        system: 'You are a JSON API. Respond with ONLY a valid JSON object. No markdown code fences, no explanation text, no preamble. Start your response with { and end with }.',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
              { type: 'text', text: prompt }
            ]
          },
          { role: 'assistant', content: '{"verdict":' }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || 'API 오류' });

    const rawText = data?.content?.map(c => c.text || '').join('').trim();
    // assistant prefill로 '{'를 넣었으므로 앞에 '{' 추가
    const fullText = '{"verdict":' + rawText;

    let parsed = null;
    const attempts = [
      () => JSON.parse(fullText),
      () => JSON.parse(rawText),
      () => { const m = fullText.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; },
    ];
    for (const fn of attempts) {
      try { const r = fn(); if (r && r.verdict) { parsed = r; break; } } catch {}
    }

    return res.status(200).json({ model_used: model, text: fullText, parsed });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
