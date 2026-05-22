export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  const model = (process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5').trim();
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' });

  try {
    const { imageBase64, mimeType, reviewType, brandName, purpose, benefit, cta, memo, specCheck, directorType } = req.body || {};
    if (!imageBase64 || !mimeType) return res.status(400).json({ error: '이미지가 없습니다.' });

    const directorProfiles = {
      A: {
        name: '완성도 디렉터',
        desc: '마감감·디테일 최우선. 픽셀 단위 정렬, 합성 품질, 폰트 일관성에 민감하다.',
        focus: '완성도와 마감감을 가장 엄격하게 검수한다. 정렬이 1px 틀려도 리턴한다. 브랜드 톤보다 "완성된 느낌"을 우선시한다.',
      },
      B: {
        name: '브랜드 디렉터',
        desc: '브랜드 톤·무드 최우선. 색감, 분위기, 브랜드 아이덴티티에 가장 예민하다.',
        focus: '브랜드 톤과 무드를 가장 엄격하게 검수한다. 완성도보다 "브랜드답게 느껴지는가"를 우선시한다. 프리미엄 브랜드가 싸 보이면 무조건 리턴한다.',
      },
      C: {
        name: '구조 디렉터',
        desc: 'TV 시청 환경·정보 위계 최우선. 멀리서 읽히는지, 핵심이 한눈에 들어오는지를 가장 중요하게 본다.',
        focus: 'TV 시청 환경 적합성과 정보 위계를 가장 엄격하게 검수한다. 디테일보다 "한눈에 읽히는가"를 우선시한다. 텍스트가 많거나 CTA가 약하면 무조건 리턴한다.',
      },
    };

    const dp = directorProfiles[directorType] || directorProfiles.A;

    const prompt = `당신은 TV 서비스 디자인 시안을 사전 검수하는 AI 디자인 디렉터 보조 에이전트입니다.

지금 적용된 디렉터 타입: ${dp.name} (${dp.desc})
이 디렉터의 검수 우선순위: ${dp.focus}

검수 대상:
- 유형: ${reviewType || '미입력'}
- 브랜드: ${brandName || '미입력'}
- 화면 목적: ${purpose || '미입력'}
- 주요 혜택: ${benefit || '미입력'}
- CTA: ${cta || '미입력'}
- 메모: ${memo || '없음'}

규격 체크 결과: ${JSON.stringify(specCheck || {})}

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요.

{
  "verdict": "치명 리스크 | 수정 권장 | 검토 필요 | 양호",
  "directorType": "${directorType || 'A'}",
  "summary": ["핵심 리스크 1문장", "핵심 리스크 1문장"],
  "sections": [
    {
      "id": "tv",
      "title": "TV 시청 환경 적합성",
      "verdict": "치명 리스크 | 수정 권장 | 검토 필요 | 양호",
      "cause": "기획/UX 구조 리스크 | 디자인 표현 리스크 | 복합 리스크",
      "problem": "문제 1~2문장",
      "reason": "이유 1~2문장",
      "suggestion": "제안 1~2문장"
    },
    {
      "id": "hierarchy",
      "title": "정보 위계",
      "verdict": "치명 리스크 | 수정 권장 | 검토 필요 | 양호",
      "cause": "기획/UX 구조 리스크 | 디자인 표현 리스크 | 복합 리스크",
      "problem": "문제 1~2문장",
      "reason": "이유 1~2문장",
      "suggestion": "제안 1~2문장"
    },
    {
      "id": "brand",
      "title": "브랜드 톤 유지",
      "verdict": "치명 리스크 | 수정 권장 | 검토 필요 | 양호",
      "cause": null,
      "problem": "문제 1~2문장",
      "reason": "이유 1~2문장",
      "suggestion": "제안 1~2문장"
    },
    {
      "id": "finish",
      "title": "완성도 / 마감감",
      "verdict": "치명 리스크 | 수정 권장 | 검토 필요 | 양호",
      "cause": null,
      "problem": "문제 1~2문장",
      "reason": "이유 1~2문장",
      "suggestion": "제안 1~2문장"
    }
  ],
  "priorities": ["1순위 수정 항목", "2순위 수정 항목", "3순위 수정 항목"],
  "finalComment": "디렉터 전달 가능 여부 2~3문장"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model, max_tokens: 2000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          { type: 'text', text: prompt }
        ]}]
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || 'API 오류' });
    const text = data?.content?.map(c => c.text || '').join('');
    let parsed;
    try { parsed = JSON.parse(text.replace(/```json|```/g, '').trim()); }
    catch { parsed = null; }
    return res.status(200).json({ model_used: model, text, parsed });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
