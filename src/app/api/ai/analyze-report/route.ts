import { NextRequest, NextResponse } from 'next/server';

const GROQ_KEYS = [
    process.env.GROQ_API_KEY_2 || '', // Use Agent 2 for report analysis
    process.env.GROQ_API_KEY_1 || '',
].filter(Boolean);

function stripThinkTags(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function extractImageDataUrl(reportText?: string, imageData?: string): string | null {
    if (imageData && imageData.startsWith('data:image/')) {
        return imageData;
    }
    if (reportText) {
        const match = reportText.match(/\[IMAGE_BASE64\]([\s\S]*?)\[\/IMAGE_BASE64\]/);
        if (match && match[1]) {
            const typeMatch = reportText.match(/Type:\s*(image\/[^\s\n]+)/i);
            const mime = typeMatch ? typeMatch[1] : 'image/jpeg';
            return `data:${mime};base64,${match[1].trim()}`;
        }
    }
    return null;
}

export async function POST(request: NextRequest) {
    try {
        const { reportText, imageData, fileName, userContext } = await request.json();

        const resolvedImage = extractImageDataUrl(reportText, imageData);

        const systemPrompt = `You are HealthSync's Medical Report Analyzer (Agent 2). Analyze the given medical report (text or scanned/photographed report image) and extract every visible clinical observation, vital sign, and diagnostic lab value.

${userContext ? `PATIENT CONTEXT:\n${userContext}\n` : ''}

PROVIDE YOUR RESPONSE IN THIS EXACT JSON FORMAT (raw JSON only, no markdown fences, no extra prose):
{
  "laymanSummary": "A clear, simple explanation of the report in everyday language. Explain what each test/vital means and whether values are normal or elevated. Use helpful analogies.",
  "technicalSummary": "A concise, professional clinical summary listing exact values, reference ranges, symptoms, and impressions suitable for a doctor's review.",
  "abnormalities": ["List each abnormal finding with its exact measured value and reference range as a separate string"],
  "recommendations": ["List each practical recommendation (follow-up, diet, lifestyle, monitoring) as a separate string"],
  "urgencyLevel": "green|amber|red",
  "urgencyExplanation": "Brief explanation of why this urgency level was assigned",
  "suggestedSpecialist": "Type of specialist to consult (e.g., Endocrinologist / Diabetologist, Cardiologist, General Physician)",
  "estimatedCondition": "What condition these results may suggest (with a clear non-diagnostic disclaimer)",
  "medications": ["Commonly discussed medications mentioned in the report or relevant for doctor discussion (never prescribe directly)"],
  "followUpTests": ["Recommended follow-up lab tests"],
  "janAushadhiAlternatives": ["Affordable Jan Aushadhi (Indian generic) alternatives with approximate INR prices when relevant"],
  "isFake": false
}

CRITICAL: VALID VS. INVALID REPORT DETECTION
- Set "isFake": true ONLY when the upload clearly contains NO genuine or plausible medical/clinical data — for example: random non-medical photos (selfies, memes, scenery, receipts), gibberish, lorem ipsum, jokes, or medically impossible values (e.g., BP 999/5000, Heart Rate -50 bpm).
- IMPORTANT: Sample, simulated, demo, or training medical reports that carry labels like "SAMPLE", "MOCK DATA", "SIMULATED", "TESTING ONLY", or "TEST_USER" MUST STILL BE ANALYZED ("isFake": false) as long as they contain real, plausible clinical symptoms, vitals, or diagnostic lab values (such as Fasting Plasma Glucose, HbA1c, Random Blood Glucose, Blood Pressure, CBC, Lipid Panel, Urinalysis, etc.).
- When isFake is true, set laymanSummary to "This does not appear to be a genuine medical report. Please upload a real medical report for analysis.", set urgencyLevel to "red", and leave abnormalities/recommendations empty.

RULES:
- NEVER issue a definitive diagnosis. Use phrases like "these results may suggest" or "your doctor should evaluate".
- Extract exact numeric values from the report (e.g., Fasting Plasma Glucose, HbA1c, Random Blood Glucose, BP, BMI, SpO2, etc.) and flag abnormal values clearly.
- Suggest Jan Aushadhi (generic) alternatives for commonly discussed medications (e.g., Metformin, Atorvastatin, Amlodipine) when relevant.
- Include a disclaimer that this is AI analysis and must be verified by a qualified doctor.`;

        const model = resolvedImage ? 'qwen/qwen3.8-27b' : 'openai/gpt-oss-20b';

        const userContent = resolvedImage
            ? [
                  {
                      type: 'text',
                      text: `Analyze this medical report image (File: ${fileName || 'uploaded-report'}). Read all visible patient symptoms, vitals, diagnostic lab values, and clinical notes carefully, and respond ONLY with the required JSON object.`,
                  },
                  {
                      type: 'image_url',
                      image_url: { url: resolvedImage },
                  },
              ]
            : `Analyze this medical report. File: ${fileName || 'uploaded-report'}.\n\nReport Content:\n${reportText || ''}\n\nProvide structured analysis in JSON format only.`;

        let data: { error?: { message?: string }; choices?: Array<{ message?: { content?: string } }> } | null = null;

        for (let i = 0; i < GROQ_KEYS.length; i++) {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${GROQ_KEYS[i]}`,
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userContent },
                    ],
                    temperature: 0.2,
                    max_completion_tokens: 4096,
                }),
            });

            data = await response.json();
            if (!data?.error) break;
        }

        if (!data || data.error) {
            return NextResponse.json({ error: data?.error?.message || 'AI analysis service error' }, { status: 500 });
        }

        const rawText = data.choices?.[0]?.message?.content || '';
        const cleaned = stripThinkTags(rawText);

        let analysis;
        try {
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            analysis = jsonMatch
                ? JSON.parse(jsonMatch[0])
                : { laymanSummary: cleaned, technicalSummary: cleaned, abnormalities: [], recommendations: [], urgencyLevel: 'amber' };
        } catch {
            analysis = { laymanSummary: cleaned, technicalSummary: cleaned, abnormalities: [], recommendations: [], urgencyLevel: 'amber' };
        }

        // Map isFake to isValidReport for frontend
        if (analysis.isFake === true) {
            analysis.isValidReport = false;
            analysis.validationMessage = analysis.laymanSummary || 'This does not appear to be a legitimate medical report.';
        } else {
            analysis.isValidReport = true;
        }

        return NextResponse.json({ analysis });
    } catch (error) {
        console.error('Report Analysis Error:', error);
        return NextResponse.json({ error: 'Failed to analyze report' }, { status: 500 });
    }
}
