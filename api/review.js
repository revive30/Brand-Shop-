export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  const model = (process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5').trim();
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' });

  try {
    const { imageBase64, mimeType, reviewType, brandName, purpose, benefit, cta, memo, specCheck, directorType } = req.body || {};
    if (!imageBase64 || !mimeType) return res.status(400).json({ error: '이미지가 없습니다.' });

    const directorProfiles = {
      A: { name: '완성도 디렉터', desc: '마감감과 디테일 최우선. 픽셀 단위 정렬, 합성 품질, 폰트 일관성에 민감하다.', focus: '완성도와 마감감을 가장 엄격하게 검수한다. 정렬이 1px 틀려도 리턴한다.' },
      B: { name: '브랜드 디렉터', desc: '브랜드 톤과 무드 최우선. 색감, 분위기, 브랜드 아이덴티티에 가장 예민하다.', focus: '브랜드 톤과 무드를 가장 엄격하게 검수한다. 프리미엄 브랜드가 싸 보이면 무조건 리턴한다.' },
      C: { name: '구조 디렉터', desc: 'TV 시청 환경과 정보 위계 최우선. 멀리서 읽히는지, 핵심이 한눈에 들어오는지를 가장 중요하게 본다.', focus: 'TV 시청 환경 적합성과 정보 위계를 가장 엄격하게 검수한다. 텍스트가 많거나 CTA가 약하면 무조건 리턴한다.' },
    };

    const dp = directorProfiles[directorType] || directorProfiles.A;

    const prompt = `You are an AI design pre-review agent for TV service design drafts.

Current director type: ${dp.name} (${dp.desc})
This director's review priority: ${dp.focus}

Review target:
- Type: ${reviewType || 'not entered'}
- Brand: ${brandName || 'not entered'}
- Screen purpose: ${purpose || 'not entered'}
- Key benefit: ${benefit || 'not entered'}
- CTA: ${cta || 'not entered'}
- Memo: ${memo || 'none'}
- Spec check result: ${JSON.stringify(specCheck || {})}

IMPORTANT: Respond ONLY with a valid JSON object. No markdown, no code fences, no explanation text. Just the raw JSON.

The markers array marks problematic areas on the image.
x and y are percentages (0-100) relative to the full image size.
severity must be exactly one of: "critical", "warning", or "info"

Required JSON structure:
{
  "verdict": "치명 리스크",
  "directorType": "${directorType || 'A'}",
  "summary": ["핵심 리스크 요약 1", "핵심 리스크 요약 2"],
  "markers": [
    {
      "id": 1,
      "x": 25,
      "y": 30,
      "severity": "critical",
      "label": "마커 제목",
      "comment": "이 영역의 문제점 설명 2-3문장"
    }
  ],
  "sections": [
    {
      "id": "tv",
      "title": "TV 시청 환경 적합성",
      "verdict": "치명 리스크",
      "cause": "복합 리스크",
      "problem": "문제 설명",
      "reason": "이유 설명",
      "suggestion": "개선 제안",
      "markerIds": [1]
    },
    {
      "id": "hierarchy",
      "title": "정보 위계",
      "verdict": "수정 권장",
      "cause": "기획/UX 구조 리스크",
      "problem": "문제 설명",
      "reason": "이유 설명",
      "suggestion": "개선 제안",
      "markerIds": []
    },
    {
      "id": "brand",
      "title": "브랜드 톤 유지",
      "verdict": "검토 필요",
      "cause": null,
      "problem": "문제 설명",
      "reason": "이유 설명",
      "suggestion": "개선 제안",
      "markerIds": []
    },
    {
      "id": "finish",
      "title": "완성도 / 마감감",
      "verdict": "수정 권장",
      "cause": null,
      "problem": "문제 설명",
      "reason": "이유 설명",
      "suggestion": "개선 제안",
      "markerIds": [1]
    }
  ],
  "priorities": ["1순위 수정 항목", "2순위 수정 항목", "3순위 수정 항목"],
  "finalComment": "디렉터 전달 가능 여부 2-3문장"
}

verdict values must be exactly one of: "치명 리스크", "수정 권장", "검토 필요", "양호"
All text values should be in Korean.
Respond with ONLY the JSON object, nothing else.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model, max_tokens: 2500,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          { type: 'text', text: prompt }
        ]}]
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || 'API 오류' });

    const text = data?.content?.map(c => c.text || '').join('').trim();
    
    let parsed = null;
    // Try multiple parsing strategies
    const strategies = [
      () => JSON.parse(text),
      () => JSON.parse(text.replace(/^```json\s*/,'').replace(/\s*```$/,'')),
      () => { const m = text.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; },
    ];
    
    for (const strategy of strategies) {
      try {
        parsed = strategy();
        if (parsed && parsed.verdict) break;
      } catch {}
    }

    return res.status(200).json({ model_used: model, text, parsed });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
