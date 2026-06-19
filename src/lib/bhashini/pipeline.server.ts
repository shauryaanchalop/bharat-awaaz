// Bhashini ULCA pipeline integration.
// Docs: https://bhashini.gov.in/ulca/apis (Pipeline Config + Inference)

const CONFIG_URL = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline";
const PIPELINE_ID = "64392f96daac500b55c543cd"; // MeitY's public Bhashini pipeline

type PipelineCacheEntry = {
  inferenceEndpoint: string;
  inferenceKey: string;
  serviceIds: { asr?: string; nmt?: string; tts?: string };
  expires: number;
};

const cache = new Map<string, PipelineCacheEntry>();

function getCreds() {
  const userId = process.env.BHASHINI_USER_ID;
  const apiKey = process.env.BHASHINI_API_KEY;
  if (!userId || !apiKey) return null;
  return { userId, apiKey };
}

export function bhashiniAvailable() {
  return getCreds() !== null;
}

async function configurePipeline(sourceLang: string, targetLang = "en"): Promise<PipelineCacheEntry | null> {
  const creds = getCreds();
  if (!creds) return null;
  const key = `${sourceLang}-${targetLang}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached;

  const body = {
    pipelineTasks: [
      { taskType: "asr", config: { language: { sourceLanguage: sourceLang } } },
      { taskType: "translation", config: { language: { sourceLanguage: sourceLang, targetLanguage: targetLang } } },
      { taskType: "tts", config: { language: { sourceLanguage: sourceLang } } },
    ],
    pipelineRequestConfig: { pipelineId: PIPELINE_ID },
  };

  const res = await fetch(CONFIG_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      userID: creds.userId,
      ulcaApiKey: creds.apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Bhashini config failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    pipelineResponseConfig: { taskType: string; config: { serviceId: string }[] }[];
    pipelineInferenceAPIEndPoint: {
      callbackUrl: string;
      inferenceApiKey: { name: string; value: string };
    };
  };

  const serviceIds: PipelineCacheEntry["serviceIds"] = {};
  for (const t of data.pipelineResponseConfig) {
    const sid = t.config[0]?.serviceId;
    if (!sid) continue;
    if (t.taskType === "asr") serviceIds.asr = sid;
    if (t.taskType === "translation") serviceIds.nmt = sid;
    if (t.taskType === "tts") serviceIds.tts = sid;
  }

  const entry: PipelineCacheEntry = {
    inferenceEndpoint: data.pipelineInferenceAPIEndPoint.callbackUrl,
    inferenceKey: data.pipelineInferenceAPIEndPoint.inferenceApiKey.value,
    serviceIds,
    expires: Date.now() + 30 * 60 * 1000,
  };
  cache.set(key, entry);
  return entry;
}

export async function runAsrTranslate(audioBase64: string, sourceLang: string) {
  const pipeline = await configurePipeline(sourceLang, "en");
  if (!pipeline) return null;
  const body = {
    pipelineTasks: [
      {
        taskType: "asr",
        config: {
          language: { sourceLanguage: sourceLang },
          serviceId: pipeline.serviceIds.asr,
          audioFormat: "webm",
          samplingRate: 16000,
        },
      },
      {
        taskType: "translation",
        config: {
          language: { sourceLanguage: sourceLang, targetLanguage: "en" },
          serviceId: pipeline.serviceIds.nmt,
        },
      },
    ],
    inputData: { audio: [{ audioContent: audioBase64 }] },
  };
  const res = await fetch(pipeline.inferenceEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: pipeline.inferenceKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Bhashini ASR failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    pipelineResponse: { taskType: string; output: { source: string; target?: string }[] }[];
  };
  const asr = data.pipelineResponse.find((p) => p.taskType === "asr");
  const trans = data.pipelineResponse.find((p) => p.taskType === "translation");
  return {
    transcript: asr?.output[0]?.source ?? "",
    translatedEnglish: trans?.output[0]?.target ?? asr?.output[0]?.source ?? "",
  };
}

export async function runTranslateTts(englishText: string, targetLang: string) {
  if (targetLang === "en") {
    // English passthrough: still need TTS. Use Bhashini's en TTS.
  }
  const pipeline = await configurePipeline(targetLang, "en");
  if (!pipeline) return null;
  const tasks: object[] = [];
  if (targetLang !== "en") {
    tasks.push({
      taskType: "translation",
      config: {
        language: { sourceLanguage: "en", targetLanguage: targetLang },
        serviceId: pipeline.serviceIds.nmt,
      },
    });
  }
  tasks.push({
    taskType: "tts",
    config: {
      language: { sourceLanguage: targetLang },
      serviceId: pipeline.serviceIds.tts,
      gender: "female",
    },
  });
  const body = { pipelineTasks: tasks, inputData: { input: [{ source: englishText }] } };
  const res = await fetch(pipeline.inferenceEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: pipeline.inferenceKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Bhashini TTS failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    pipelineResponse: {
      taskType: string;
      output?: { source: string; target?: string }[];
      audio?: { audioContent: string }[];
    }[];
  };
  const translation = data.pipelineResponse.find((p) => p.taskType === "translation");
  const tts = data.pipelineResponse.find((p) => p.taskType === "tts");
  return {
    translatedText: translation?.output?.[0]?.target ?? englishText,
    audioBase64: tts?.audio?.[0]?.audioContent ?? "",
  };
}
