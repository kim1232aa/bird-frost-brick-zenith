//#region node_modules/.nitro/vite/services/ssr/assets/catalog-D989O0dv.js
var OPENAI_SPEECH_REFERENCE = "https://platform.openai.com/docs/api-reference/audio/createSpeech";
var OPENAI_SPEECH_FORMATS = [
	"mp3",
	"opus",
	"aac",
	"flac",
	"wav",
	"pcm"
];
var AUDIO_CAPABILITY_PROFILES = {
	"openai-tts-1-speech": {
		id: "openai-tts-1-speech",
		provider: "openai",
		label: "OpenAI tts-1 / tts-1-hd Speech",
		operation: "text-to-speech",
		availability: { state: "supported" },
		serialization: {
			kind: "openai-audio-speech",
			endpoint: "/audio/speech"
		},
		supportsInstructions: false,
		responseFormats: OPENAI_SPEECH_FORMATS,
		speed: {
			minimum: .25,
			maximum: 4
		},
		maximumInputCharacters: 4096,
		evidence: [OPENAI_SPEECH_REFERENCE]
	},
	"openai-gpt-4o-mini-tts-speech": {
		id: "openai-gpt-4o-mini-tts-speech",
		provider: "openai",
		label: "OpenAI gpt-4o-mini-tts Speech",
		operation: "text-to-speech",
		availability: { state: "supported" },
		serialization: {
			kind: "openai-audio-speech",
			endpoint: "/audio/speech"
		},
		supportsInstructions: true,
		responseFormats: OPENAI_SPEECH_FORMATS,
		speed: {
			minimum: .25,
			maximum: 4
		},
		maximumInputCharacters: 4096,
		evidence: [OPENAI_SPEECH_REFERENCE]
	}
};
Object.freeze(Object.keys(AUDIO_CAPABILITY_PROFILES));
function isAudioCapabilityProfileId(value) {
	return typeof value === "string" && value in AUDIO_CAPABILITY_PROFILES;
}
function normalizeAudioCapabilityProfiles(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
	const normalized = {};
	for (const [rawModel, profile] of Object.entries(value)) {
		const model = String(rawModel || "").trim();
		if (model && model !== "*" && isAudioCapabilityProfileId(profile)) normalized[model] = profile;
	}
	return Object.keys(normalized).length ? normalized : void 0;
}
var VERIFIED_AT = "2026-08-03";
var OPENAI_IMAGE_GUIDE = evidence("official-doc", "https://developers.openai.com/api/docs/guides/image-generation", `OpenAI image guide, checked ${VERIFIED_AT}`);
var OPENAI_IMAGE_API = evidence("official-openapi", "https://developers.openai.com/api/reference/resources/images", `OpenAI Images API, checked ${VERIFIED_AT}`);
var OPENAI_DEPRECATIONS = evidence("official-doc", "https://developers.openai.com/api/docs/deprecations", "DALL-E 2 and DALL-E 3 were removed from the OpenAI API on 2026-05-12");
var AGNES_21_DOC = evidence("official-doc", "https://agnes-ai.com/zh-Hans/docs/agnes-image-21-flash", `Agnes Image 2.1 guide, checked ${VERIFIED_AT}`);
var AGNES_20_DOC = evidence("official-doc", "https://agnes-ai.com/en/docs/agnes-image-20-flash", `Agnes Image 2.0 guide, checked ${VERIFIED_AT}`);
var DASHSCOPE_IMAGE_DOC = evidence("official-doc", "https://help.aliyun.com/en/model-studio/image-model/", `DashScope image model comparison, checked ${VERIFIED_AT}`);
var DASHSCOPE_QWEN_IMAGE_DOC = evidence("official-doc", "https://help.aliyun.com/en/model-studio/qwen-image-api", "Qwen Image generation API, checked 2026-08-04");
var DASHSCOPE_QWEN_EDIT_DOC = evidence("official-doc", "https://help.aliyun.com/en/model-studio/qwen-image-edit-guide", `Qwen Image edit guide, checked ${VERIFIED_AT}`);
var DASHSCOPE_WAN27_DOC = evidence("official-doc", "https://help.aliyun.com/en/model-studio/wan-image-generation-and-editing-api-reference", `Wan2.7 image API, checked ${VERIFIED_AT}`);
var DASHSCOPE_WAN26_DOC = evidence("official-doc", "https://help.aliyun.com/en/model-studio/wan-image-generation-api-reference", `Wan2.6 image API, checked ${VERIFIED_AT}`);
var DASHSCOPE_Z_DOC = evidence("official-doc", "https://help.aliyun.com/en/model-studio/z-image-api-reference", `Z-Image API, checked ${VERIFIED_AT}`);
var ARK_IMAGE_API = evidence("official-openapi", "https://api.volcengine.com/api-docs/view?action=ImageGenerations&serviceCode=ark&version=2024-01-01", `Ark ImageGenerations API, checked ${VERIFIED_AT}`);
var ARK_SEEDREAM_GUIDE = evidence("official-doc", "https://www.volcengine.com/docs/82379/1829186", `Seedream 4.0-5.0 guide, checked ${VERIFIED_AT}`);
var SENSENOVA_U1_DOC = evidence("official-doc", "https://platform.sensenova.cn/docs#model-u1", `SenseNova U1 Fast contract, checked ${VERIFIED_AT}`);
var SENSENOVA_MIAOHUA_DOC = evidence("official-doc", "https://largemodel.sensetime.com/product/APIService/document/96/", `SenseTime Miaohua API, checked ${VERIFIED_AT}`);
var CIVITAI_IMAGE_OPENAPI = evidence("live-openapi", "https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml", `Civitai imageGen live OpenAPI, checked ${VERIFIED_AT}`);
var XAI_IMAGE_API = evidence("official-openapi", "https://docs.x.ai/api-reference", "xAI Images API /v1/images/generations: n 1-10, response_format url|b64_json; size/quality/style are not request fields, checked 2026-08-14");
var XAI_IMAGINE_GUIDE = evidence("official-doc", "https://docs.x.ai/docs/guides/image-generations", "xAI Imagine guide: grok-imagine-image generation; the edit contract (up to 3 references) uses the Imagine JSON image_url shape, not OpenAI multipart edits, checked 2026-08-14");
var XAI_IMAGINE_EDIT_OPENAPI = evidence("official-openapi", "https://docs.x.ai/openapi.json", "xAI EditImageRequest on POST /v1/images/edits: JSON body (not multipart); prompt required; image {url} and images [{url}] are mutually exclusive, images max 3; url accepts base64 data URI (JPEG/PNG/WebP); n and response_format documented, checked 2026-08-15");
var XAI_IMAGINE_MULTI_EDIT_GUIDE = evidence("official-doc", "https://docs.x.ai/developers/model-capabilities/images/multi-image-editing", "xAI multi-image editing guide: up to 3 reference images, aspect_ratio only valid for multi-image edits, checked 2026-08-15");
var GEMINI_IMAGE_GUIDE = evidence("official-doc", "https://ai.google.dev/gemini-api/docs/image-generation", "Gemini image models (Nano Banana family): gemini-3.1-flash-image / gemini-3-pro-image (GA) and gemini-3.1-flash-image-preview / gemini-3-pro-image-preview (legacy preview IDs); text+image input editing; up to 14 input images depending on tier, checked 2026-08-15");
var GEMINI_OPENAI_COMPAT_DOC = evidence("official-doc", "https://ai.google.dev/gemini-api/docs/openai", "Google first-party OpenAI-compatible layer exposes Gemini image models on /v1beta/openai/images/generations; chat/completions is documented for text models only, checked 2026-08-15");
var KLONG_GEMINI_CHAT_IMAGE_LIVE = evidence("live-api", "https://api.klong.lat/v1", "Live probe 2026-08-15: /images/generations rejects gemini-*-image* models (\"only imagen models are supported\"); chat/completions returns ![image](data:image/jpeg;base64,...) for text-to-image and for text+image_url editing with 1 and 2 references on gemini-3-pro-image-preview-c and gemini-3.1-flash-image-preview-c");
var CIVITAI_KLEIN_OR_QWEN_EDIT = "image/flux2/klein/editImage/9b 或 image/sdcpp/qwen/20b/editImage";
var UNSUPPORTED_REFERENCES = unsupported("该 operation 不接受参考图片；请改用对应的 edit 或 variation 服务，而不是忽略已连接图片");
var UNSUPPORTED_MASK = unsupported("该合同没有栅格 mask 请求字段");
var UNSUPPORTED_QUALITY = unsupported("该合同没有 quality 请求字段");
var UNKNOWN_SIZE = unknown("该模型的完整 size 枚举或边界未由官方发布");
var UNKNOWN_OUTPUT_FORMAT = unknown("该模型的可选输出文件格式未由官方发布");
var GPT_IMAGE_2_SIZE = dimensions({
	allowAuto: true,
	boundsPublished: true,
	rules: {
		minPixels: 655360,
		maxPixels: 8294400,
		maxWidth: 3840,
		maxHeight: 3840,
		multipleOf: 16,
		maxAspectRatio: 3
	},
	note: "GPT Image 2 arbitrary dimensions: both edges are 16-aligned, aspect ratio <= 3:1"
});
var GPT_IMAGE_LEGACY_SIZES = enumSize([
	"auto",
	"1024x1024",
	"1536x1024",
	"1024x1536"
]);
var GPT_IMAGE_QUALITY = enumField([
	"auto",
	"low",
	"medium",
	"high"
]);
var GPT_IMAGE_FORMAT = enumField([
	"png",
	"jpeg",
	"webp"
]);
var RESPONSES_IMAGE_TOOL_SIZES = enumSize([
	"auto",
	"1024x1024",
	"1536x1024",
	"1024x1536"
]);
var DALL_E_2_SIZES = enumSize([
	"256x256",
	"512x512",
	"1024x1024"
]);
var AGNES_21_SIZE = tierAndRatio([
	"1K",
	"2K",
	"3K",
	"4K"
], [
	"1:1",
	"3:4",
	"4:3",
	"16:9",
	"9:16",
	"2:3",
	"3:2",
	"21:9"
], {
	required: true,
	dimensions: {
		rules: {},
		boundsPublished: false
	},
	note: "ratio is optional; the official API also accepts exact dimensions but does not publish their complete bounds"
});
var AGNES_20_SIZE = dimensions({
	required: true,
	boundsPublished: false,
	rules: {},
	examples: [
		"1024x768",
		"1024x1024",
		"768x1024"
	],
	note: "Official documentation lists examples, not an exhaustive enum or numeric bounds"
});
var DASHSCOPE_512_TO_2048_SIZE = dimensions({
	boundsPublished: true,
	rules: {
		minPixels: 262144,
		maxPixels: 4194304
	}
});
var DASHSCOPE_QWEN_SINGLE_SIZES = enumSize([
	"1664x928",
	"1472x1104",
	"1328x1328",
	"1104x1472",
	"928x1664"
]);
var DASHSCOPE_WAN27_PRO_SIZE = dimensions({
	boundsPublished: true,
	rules: {
		minPixels: 589824,
		maxPixels: 16777216,
		maxAspectRatio: 8
	}
});
var DASHSCOPE_WAN27_STANDARD_SIZE = dimensions({
	boundsPublished: true,
	rules: {
		minPixels: 589824,
		maxPixels: 4194304,
		maxAspectRatio: 8
	}
});
var DASHSCOPE_WAN27_EDIT_SIZE = dimensions({
	boundsPublished: true,
	rules: {
		minPixels: 589824,
		maxPixels: 4194304,
		maxAspectRatio: 8
	}
});
var DASHSCOPE_WAN26_EDIT_SIZE = dimensions({
	boundsPublished: true,
	rules: {
		minPixels: 589824,
		maxPixels: 4194304,
		maxAspectRatio: 4
	}
});
var SENSENOVA_U1_SIZES = enumSize([
	"1664x2496",
	"2496x1664",
	"1760x2368",
	"2368x1760",
	"1824x2272",
	"2272x1824",
	"2048x2048",
	"2752x1536",
	"1536x2752",
	"3072x1376",
	"1344x3136"
]);
var MIAOHUA_SIZE = dimensions({
	boundsPublished: true,
	rules: {
		minWidth: 640,
		minHeight: 640,
		maxWidth: 6e3,
		maxHeight: 6e3
	}
});
var CIVITAI_Z_SIZE = dimensions({
	required: false,
	boundsPublished: true,
	rules: {
		minWidth: 64,
		minHeight: 64,
		maxWidth: 2048,
		maxHeight: 2048,
		multipleOf: 16,
		defaultWidth: 1024,
		defaultHeight: 1024
	}
});
var CIVITAI_Z_ADVANCED_FIELDS = {
	negativePrompt: {
		state: "supported",
		kind: "string",
		wireName: "negativePrompt",
		maxLength: 1e4
	},
	steps: {
		state: "supported",
		kind: "number",
		wireName: "steps",
		min: 1,
		max: 150,
		integer: true
	},
	cfgScale: {
		state: "supported",
		kind: "number",
		wireName: "cfgScale",
		min: 0,
		max: 30
	},
	seed: {
		state: "supported",
		kind: "int64",
		wireName: "seed"
	},
	sampler: {
		state: "supported",
		kind: "enum",
		wireName: "sampleMethod",
		values: [
			"euler",
			"heun",
			"dpm2",
			"dpm++2s_a",
			"dpm++2m",
			"dpm++2mv2",
			"ipndm",
			"ipndm_v",
			"ddim_trailing",
			"euler_a",
			"lcm",
			"res_multistep",
			"res_2s",
			"tcd",
			"er_sde"
		]
	},
	scheduler: {
		state: "supported",
		kind: "enum",
		wireName: "schedule",
		values: [
			"simple",
			"discrete",
			"karras",
			"exponential",
			"ays",
			"bong_tangent",
			"gits",
			"sgm_uniform",
			"smoothstep",
			"kl_optimal",
			"lcm"
		],
		note: "capitanZiT is not in the live OpenAPI enum"
	},
	sequential: unknown("sequential mode is not part of this Civitai service contract"),
	clipSkip: unknown("clipSkip 仅 Civitai SD1 ecosystem 服务可用"),
	loras: {
		state: "supported",
		kind: "number-map",
		wireName: "loras",
		note: "Keys are original model-version AIR identifiers; live OpenAPI does not publish a numeric strength bound"
	}
};
var DASHSCOPE_WAN27_ADVANCED_FIELDS = {
	...unknownAdvancedFields(),
	sequential: {
		state: "supported",
		kind: "boolean",
		wireName: "enable_sequential",
		note: "Explicit image-set mode: n is a maximum (1-12), and the provider may return fewer images"
	}
};
var OPENAI_GENERATE_SERIALIZATION = serialization({
	kind: "openai-images-generate",
	endpoint: "/images/generations",
	quantityField: "n",
	sizeField: "size",
	qualityField: "quality",
	outputFormatField: "output_format"
});
var OPENAI_EDIT_SERIALIZATION = serialization({
	kind: "openai-images-edit",
	endpoint: "/images/edits",
	quantityField: "n",
	referenceField: "image[]",
	maskField: "mask",
	sizeField: "size",
	qualityField: "quality",
	outputFormatField: "output_format"
});
var IMAGE_CAPABILITY_PROFILES = {
	"openai-gpt-image-2-generate": profile({
		id: "openai-gpt-image-2-generate",
		provider: "openai",
		label: "OpenAI GPT Image 2 generation",
		operation: "generate",
		outputCount: nativeBatch(1, 10),
		referenceCount: UNSUPPORTED_REFERENCES,
		mask: UNSUPPORTED_MASK,
		size: GPT_IMAGE_2_SIZE,
		quality: GPT_IMAGE_QUALITY,
		outputFormat: GPT_IMAGE_FORMAT,
		serialization: OPENAI_GENERATE_SERIALIZATION,
		evidence: [OPENAI_IMAGE_GUIDE, OPENAI_IMAGE_API]
	}),
	"openai-gpt-image-2-edit": profile({
		id: "openai-gpt-image-2-edit",
		provider: "openai",
		label: "OpenAI GPT Image 2 edit",
		operation: "edit",
		outputCount: nativeBatch(1, 10),
		referenceCount: references(1, null, "The official guide documents multiple gpt-image-2 inputs, but the current Images Edit model enum omits gpt-image-2 from the models covered by the published 16-image limit; preserve every reference and warn that the maximum is unpublished. Input order is preserved; a mask applies to the first image."),
		mask: supportedMask("first-reference", "OpenAI applies the mask to the first image when multiple images are supplied"),
		size: GPT_IMAGE_2_SIZE,
		quality: GPT_IMAGE_QUALITY,
		outputFormat: GPT_IMAGE_FORMAT,
		serialization: OPENAI_EDIT_SERIALIZATION,
		evidence: [OPENAI_IMAGE_GUIDE, OPENAI_IMAGE_API]
	}),
	"openai-gpt-image-legacy-generate": profile({
		id: "openai-gpt-image-legacy-generate",
		provider: "openai",
		label: "OpenAI GPT Image 1.x generation",
		operation: "generate",
		lifecycle: "deprecated",
		outputCount: nativeBatch(1, 10),
		referenceCount: UNSUPPORTED_REFERENCES,
		mask: UNSUPPORTED_MASK,
		size: GPT_IMAGE_LEGACY_SIZES,
		quality: GPT_IMAGE_QUALITY,
		outputFormat: GPT_IMAGE_FORMAT,
		serialization: OPENAI_GENERATE_SERIALIZATION,
		evidence: [OPENAI_IMAGE_GUIDE, OPENAI_IMAGE_API]
	}),
	"openai-gpt-image-legacy-edit": profile({
		id: "openai-gpt-image-legacy-edit",
		provider: "openai",
		label: "OpenAI GPT Image 1.x edit",
		operation: "edit",
		lifecycle: "deprecated",
		outputCount: nativeBatch(1, 10),
		referenceCount: references(1, 16),
		mask: supportedMask("first-reference"),
		size: GPT_IMAGE_LEGACY_SIZES,
		quality: GPT_IMAGE_QUALITY,
		outputFormat: GPT_IMAGE_FORMAT,
		serialization: OPENAI_EDIT_SERIALIZATION,
		evidence: [OPENAI_IMAGE_GUIDE, OPENAI_IMAGE_API]
	}),
	"openai-dall-e-2-generate": profile({
		id: "openai-dall-e-2-generate",
		provider: "openai",
		label: "DALL-E 2 generation (legacy relay contract)",
		operation: "generate",
		lifecycle: "removed",
		outputCount: nativeBatch(1, 10),
		referenceCount: UNSUPPORTED_REFERENCES,
		mask: UNSUPPORTED_MASK,
		size: DALL_E_2_SIZES,
		quality: enumField(["standard"]),
		outputFormat: enumField(["png"], {
			requestable: false,
			note: "DALL-E 2 output is PNG; this is not an output_format request field"
		}),
		serialization: serialization({
			...OPENAI_GENERATE_SERIALIZATION,
			outputFormatField: null,
			responseEncodingField: "response_format"
		}),
		evidence: [OPENAI_IMAGE_API, OPENAI_DEPRECATIONS]
	}),
	"openai-dall-e-2-edit": profile({
		id: "openai-dall-e-2-edit",
		provider: "openai",
		label: "DALL-E 2 edit (legacy relay contract)",
		operation: "edit",
		lifecycle: "removed",
		outputCount: nativeBatch(1, 10),
		referenceCount: references(1, 1, "Exactly one square PNG source image under the historical contract"),
		mask: supportedMask("single-reference"),
		size: DALL_E_2_SIZES,
		quality: UNSUPPORTED_QUALITY,
		outputFormat: enumField(["png"], { requestable: false }),
		serialization: serialization({
			...OPENAI_EDIT_SERIALIZATION,
			outputFormatField: null,
			qualityField: null,
			responseEncodingField: "response_format"
		}),
		evidence: [OPENAI_IMAGE_API, OPENAI_DEPRECATIONS]
	}),
	"openai-dall-e-2-variation": profile({
		id: "openai-dall-e-2-variation",
		provider: "openai",
		label: "DALL-E 2 variation (legacy relay contract)",
		operation: "variation",
		lifecycle: "deprecated",
		outputCount: nativeBatch(1, 10),
		referenceCount: references(1, 1),
		mask: UNSUPPORTED_MASK,
		size: DALL_E_2_SIZES,
		quality: UNSUPPORTED_QUALITY,
		outputFormat: enumField(["png"], { requestable: false }),
		serialization: serialization({
			kind: "openai-images-variation",
			endpoint: "/images/variations",
			quantityField: "n",
			referenceField: "image",
			sizeField: "size",
			responseEncodingField: "response_format"
		}),
		evidence: [OPENAI_IMAGE_API, OPENAI_DEPRECATIONS]
	}),
	"openai-dall-e-3-generate": profile({
		id: "openai-dall-e-3-generate",
		provider: "openai",
		label: "DALL-E 3 generation (legacy relay contract)",
		operation: "generate",
		lifecycle: "removed",
		outputCount: nativeBatch(1, 1),
		referenceCount: UNSUPPORTED_REFERENCES,
		mask: UNSUPPORTED_MASK,
		size: enumSize([
			"1024x1024",
			"1792x1024",
			"1024x1792"
		]),
		quality: enumField(["standard", "hd"]),
		outputFormat: enumField(["png"], { requestable: false }),
		serialization: serialization({
			...OPENAI_GENERATE_SERIALIZATION,
			outputFormatField: null,
			responseEncodingField: "response_format"
		}),
		evidence: [OPENAI_IMAGE_API, OPENAI_DEPRECATIONS]
	}),
	"openai-responses-image-tool": profile({
		id: "openai-responses-image-tool",
		provider: "openai",
		label: "OpenAI Responses image_generation tool",
		operation: "responses-tool",
		outputCount: clientFanout(null, "The tool has no n field; repeated Responses requests are an application concern"),
		referenceCount: references(0, null, "Multiple input_image items are supported; the official upper bound is unpublished"),
		mask: supportedMask("explicit-input", "input_image_mask explicitly identifies its source image"),
		size: RESPONSES_IMAGE_TOOL_SIZES,
		quality: GPT_IMAGE_QUALITY,
		outputFormat: GPT_IMAGE_FORMAT,
		serialization: serialization({
			kind: "openai-responses-image-tool",
			endpoint: "/responses",
			referenceField: "input[].content[].input_image",
			maskField: "tools[].input_image_mask",
			sizeField: "size",
			qualityField: "quality",
			outputFormatField: "output_format"
		}),
		evidence: [OPENAI_IMAGE_GUIDE]
	}),
	"xai-grok-image-generate": profile({
		id: "xai-grok-image-generate",
		provider: "openai",
		label: "xAI Grok Image generation (OpenAI-compatible contract)",
		operation: "generate",
		outputCount: nativeBatch(1, 10, "xAI documents n 1-10 on /v1/images/generations"),
		referenceCount: UNSUPPORTED_REFERENCES,
		mask: UNSUPPORTED_MASK,
		size: unsupported("xAI Images API 不接受 size 请求字段"),
		quality: unsupported("xAI Images API 不接受 quality 请求字段"),
		outputFormat: enumField(["jpg"], {
			requestable: false,
			note: "xAI image output is JPG; response_format only selects url vs b64_json transport"
		}),
		serialization: serialization({
			kind: "openai-images-generate",
			endpoint: "/images/generations",
			quantityField: "n",
			responseEncodingField: "response_format"
		}),
		evidence: [XAI_IMAGE_API, XAI_IMAGINE_GUIDE]
	}),
	"xai-grok-imagine-edit": profile({
		id: "xai-grok-imagine-edit",
		provider: "openai",
		label: "xAI Grok Imagine image edit (JSON contract)",
		operation: "edit",
		outputCount: nativeBatch(1, null, "xAI documents n on /v1/images/edits without an explicit upper bound"),
		referenceCount: references(1, 3, "xAI multi-image editing guide: up to 3 reference images; single-image edit uses the mutually exclusive image field"),
		mask: unsupported("xAI EditImageRequest 没有 mask 字段（OpenAPI 已核实）"),
		size: unsupported("xAI edits 不接受 size；aspect_ratio 仅多图编辑有效，当前合同不自动下发"),
		quality: unsupported("xAI edits 不接受 quality 请求字段"),
		outputFormat: enumField([
			"jpg",
			"png",
			"webp"
		], {
			requestable: false,
			note: "xAI GeneratedImage.mime_type 可为 jpeg/png/webp；response_format 只选择 url vs b64_json 传输"
		}),
		serialization: serialization({
			kind: "xai-imagine-edit",
			endpoint: "/images/edits",
			quantityField: "n",
			referenceField: "images[].url",
			responseEncodingField: "response_format"
		}),
		evidence: [XAI_IMAGINE_EDIT_OPENAPI, XAI_IMAGINE_MULTI_EDIT_GUIDE]
	}),
	"google-gemini-chat-image-generate": profile({
		id: "google-gemini-chat-image-generate",
		provider: "openai",
		label: "Google Gemini image generation via relay chat/completions",
		operation: "generate",
		outputCount: clientFanout(null, "chat/completions 没有图片 n 字段；多张输出由客户端逐次调用"),
		referenceCount: UNSUPPORTED_REFERENCES,
		mask: UNSUPPORTED_MASK,
		size: unsupported("中转 chat/completions 路径没有 size 请求字段（官方 images/generations 合同在中转上拒绝 gemini 图片模型）"),
		quality: unsupported("chat/completions 图片路径没有 quality 请求字段"),
		outputFormat: enumField(["jpg"], {
			requestable: false,
			note: "中转实测返回 data:image/jpeg data URL；输出格式不可请求"
		}),
		serialization: serialization({
			kind: "openai-chat-image-message",
			endpoint: "/chat/completions",
			referenceField: "messages[].content[].image_url"
		}),
		evidence: [
			KLONG_GEMINI_CHAT_IMAGE_LIVE,
			GEMINI_IMAGE_GUIDE,
			GEMINI_OPENAI_COMPAT_DOC
		]
	}),
	"google-gemini-chat-image-edit": profile({
		id: "google-gemini-chat-image-edit",
		provider: "openai",
		label: "Google Gemini image edit via relay chat/completions",
		operation: "edit",
		outputCount: clientFanout(null, "chat/completions 没有图片 n 字段；多张输出由客户端逐次调用"),
		referenceCount: references(1, 14, "Google 官方 Gemini 图片模型最多 14 张输入图（分档，3-pro-image 为 6 物体+5 角色+3 风格）；中转 chat/completions 路径实测 2 张参考图可用"),
		mask: unsupported("chat/completions 图片路径没有 mask 概念；不会静默丢弃"),
		size: unsupported("中转 chat/completions 路径没有 size 请求字段"),
		quality: unsupported("chat/completions 图片路径没有 quality 请求字段"),
		outputFormat: enumField(["jpg"], {
			requestable: false,
			note: "中转实测返回 data:image/jpeg data URL；输出格式不可请求"
		}),
		serialization: serialization({
			kind: "openai-chat-image-message",
			endpoint: "/chat/completions",
			referenceField: "messages[].content[].image_url"
		}),
		evidence: [
			KLONG_GEMINI_CHAT_IMAGE_LIVE,
			GEMINI_IMAGE_GUIDE,
			GEMINI_OPENAI_COMPAT_DOC
		]
	}),
	"agnes-image-2.1-generate": agnesProfile("agnes-image-2.1-generate", "generate", AGNES_21_SIZE, [AGNES_21_DOC]),
	"agnes-image-2.1-edit": agnesProfile("agnes-image-2.1-edit", "edit", AGNES_21_SIZE, [AGNES_21_DOC]),
	"agnes-image-2.0-generate": agnesProfile("agnes-image-2.0-generate", "generate", AGNES_20_SIZE, [AGNES_20_DOC]),
	"agnes-image-2.0-edit": agnesProfile("agnes-image-2.0-edit", "edit", AGNES_20_SIZE, [AGNES_20_DOC]),
	"dashscope-qwen-multi-generate": dashscopeProfile({
		id: "dashscope-qwen-multi-generate",
		operation: "generate",
		label: "DashScope Qwen Image generation",
		outputCount: nativeBatch(1, 6),
		referenceCount: UNSUPPORTED_REFERENCES,
		size: DASHSCOPE_512_TO_2048_SIZE,
		quantityField: "n",
		evidence: [DASHSCOPE_QWEN_IMAGE_DOC]
	}),
	"dashscope-qwen-multi-edit": dashscopeProfile({
		id: "dashscope-qwen-multi-edit",
		operation: "edit",
		label: "DashScope Qwen Image edit",
		outputCount: nativeBatch(1, 6),
		referenceCount: references(1, 3),
		size: DASHSCOPE_512_TO_2048_SIZE,
		quantityField: "n",
		evidence: [DASHSCOPE_QWEN_IMAGE_DOC, DASHSCOPE_QWEN_EDIT_DOC]
	}),
	"dashscope-qwen-single-generate": dashscopeProfile({
		id: "dashscope-qwen-single-generate",
		operation: "generate",
		label: "DashScope Qwen Image Max/Plus generation",
		outputCount: clientFanout(null, "The native operation returns one image; additional requested outputs require independent calls"),
		referenceCount: UNSUPPORTED_REFERENCES,
		size: DASHSCOPE_QWEN_SINGLE_SIZES,
		quantityField: null,
		evidence: [DASHSCOPE_QWEN_IMAGE_DOC]
	}),
	"dashscope-qwen-max-plus-edit": dashscopeProfile({
		id: "dashscope-qwen-max-plus-edit",
		operation: "edit",
		label: "DashScope Qwen Image Edit Max/Plus",
		outputCount: nativeBatch(1, 6),
		referenceCount: references(1, 3),
		size: dimensions({
			boundsPublished: true,
			rules: {
				minWidth: 512,
				minHeight: 512,
				maxWidth: 2048,
				maxHeight: 2048
			}
		}),
		quantityField: "n",
		evidence: [DASHSCOPE_QWEN_EDIT_DOC]
	}),
	"dashscope-qwen-legacy-edit": dashscopeProfile({
		id: "dashscope-qwen-legacy-edit",
		operation: "edit",
		label: "DashScope legacy Qwen Image edit",
		outputCount: clientFanout(null),
		referenceCount: references(1, 3),
		size: unsupported("The legacy edit contract does not accept a custom output size"),
		quantityField: null,
		evidence: [DASHSCOPE_QWEN_EDIT_DOC]
	}),
	"dashscope-wan-2.7-generate": dashscopeProfile({
		id: "dashscope-wan-2.7-generate",
		operation: "generate",
		label: "DashScope Wan2.7 image generation",
		outputCount: nativeBatch(1, 12, "Normal mode supports 1-4; explicit sequential mode supports a maximum of 1-12"),
		referenceCount: UNSUPPORTED_REFERENCES,
		size: DASHSCOPE_WAN27_STANDARD_SIZE,
		quantityField: "n",
		advancedFields: DASHSCOPE_WAN27_ADVANCED_FIELDS,
		evidence: [DASHSCOPE_IMAGE_DOC, DASHSCOPE_WAN27_DOC]
	}),
	"dashscope-wan-2.7-pro-generate": dashscopeProfile({
		id: "dashscope-wan-2.7-pro-generate",
		operation: "generate",
		label: "DashScope Wan2.7 image pro generation",
		outputCount: nativeBatch(1, 12, "Normal mode supports 1-4; explicit sequential mode supports a maximum of 1-12"),
		referenceCount: UNSUPPORTED_REFERENCES,
		size: DASHSCOPE_WAN27_PRO_SIZE,
		quantityField: "n",
		advancedFields: DASHSCOPE_WAN27_ADVANCED_FIELDS,
		evidence: [DASHSCOPE_IMAGE_DOC, DASHSCOPE_WAN27_DOC]
	}),
	"dashscope-wan-2.7-edit": dashscopeProfile({
		id: "dashscope-wan-2.7-edit",
		operation: "edit",
		label: "DashScope Wan2.7 image edit",
		outputCount: nativeBatch(1, 12, "Normal mode supports 1-4; explicit sequential mode supports a maximum of 1-12"),
		referenceCount: references(1, 9),
		size: DASHSCOPE_WAN27_EDIT_SIZE,
		quantityField: "n",
		advancedFields: DASHSCOPE_WAN27_ADVANCED_FIELDS,
		evidence: [DASHSCOPE_WAN27_DOC]
	}),
	"dashscope-wan-2.6-generate": dashscopeProfile({
		id: "dashscope-wan-2.6-generate",
		operation: "generate",
		label: "DashScope Wan2.6 interleaved image generation",
		outputCount: nativeBatch(1, 5),
		referenceCount: UNSUPPORTED_REFERENCES,
		size: UNKNOWN_SIZE,
		quantityField: "max_images",
		evidence: [DASHSCOPE_WAN26_DOC]
	}),
	"dashscope-wan-2.6-edit": dashscopeProfile({
		id: "dashscope-wan-2.6-edit",
		operation: "edit",
		label: "DashScope Wan2.6 image edit",
		outputCount: nativeBatch(1, 4),
		referenceCount: references(1, 4),
		size: DASHSCOPE_WAN26_EDIT_SIZE,
		quantityField: "n",
		evidence: [DASHSCOPE_WAN26_DOC]
	}),
	"dashscope-wan-2.6-t2i-generate": dashscopeProfile({
		id: "dashscope-wan-2.6-t2i-generate",
		operation: "generate",
		label: "DashScope Wan2.6 text-to-image generation",
		outputCount: nativeBatch(1, 4),
		referenceCount: UNSUPPORTED_REFERENCES,
		size: DASHSCOPE_512_TO_2048_SIZE,
		quantityField: "n",
		evidence: [DASHSCOPE_IMAGE_DOC]
	}),
	"dashscope-z-image-generate": dashscopeProfile({
		id: "dashscope-z-image-generate",
		operation: "generate",
		label: "DashScope Z-Image Turbo generation",
		outputCount: clientFanout(null),
		referenceCount: UNSUPPORTED_REFERENCES,
		size: DASHSCOPE_512_TO_2048_SIZE,
		quantityField: null,
		evidence: [DASHSCOPE_Z_DOC]
	}),
	"ark-seedream-generate": arkProfile("ark-seedream-generate", "generate"),
	"ark-seedream-edit": arkProfile("ark-seedream-edit", "edit"),
	"sensenova-u1-generate": profile({
		id: "sensenova-u1-generate",
		provider: "sensenova",
		label: "SenseNova U1 Fast generation",
		operation: "generate",
		outputCount: nativeBatch(1, null, "n defaults to 1; the official maximum is unpublished"),
		referenceCount: UNSUPPORTED_REFERENCES,
		mask: UNSUPPORTED_MASK,
		size: SENSENOVA_U1_SIZES,
		quality: UNSUPPORTED_QUALITY,
		outputFormat: UNKNOWN_OUTPUT_FORMAT,
		serialization: serialization({
			kind: "sensenova-images-generate",
			endpoint: "/images/generations",
			quantityField: "n",
			sizeField: "size",
			responseEncodingField: "response_format"
		}),
		evidence: [SENSENOVA_U1_DOC]
	}),
	"sensenova-miaohua-generate": miaohuaProfile("sensenova-miaohua-generate", "generate"),
	"sensenova-miaohua-edit": miaohuaProfile("sensenova-miaohua-edit", "edit"),
	"civitai-z-image-generate": profile({
		id: "civitai-z-image-generate",
		provider: "civitai",
		label: "Civitai Z-Image createImage",
		operation: "generate",
		outputCount: nativeBatch(1, 12),
		referenceCount: unsupported(civitaiPureTextToImageReferenceMessage("image/sdcpp/zImage/turbo/createImage")),
		mask: UNSUPPORTED_MASK,
		size: CIVITAI_Z_SIZE,
		quality: UNSUPPORTED_QUALITY,
		outputFormat: enumField([
			"jpeg",
			"png",
			"webP"
		]),
		advancedFields: CIVITAI_Z_ADVANCED_FIELDS,
		serialization: serialization({
			kind: "civitai-workflow",
			endpoint: "/v2/consumer/workflows",
			quantityField: "quantity",
			sizeField: "width+height",
			outputFormatField: "outputFormat"
		}),
		evidence: [CIVITAI_IMAGE_OPENAPI]
	}),
	"civitai-generic-generate": civitaiGenericProfile("civitai-generic-generate", "generate"),
	"civitai-generic-edit": civitaiGenericProfile("civitai-generic-edit", "edit"),
	"civitai-generic-variation": civitaiGenericProfile("civitai-generic-variation", "variation")
};
Object.freeze(Object.keys(IMAGE_CAPABILITY_PROFILES));
function isImageCapabilityProfileId(value) {
	return typeof value === "string" && value in IMAGE_CAPABILITY_PROFILES;
}
function normalizeImageCapabilityProfiles(value) {
	if (!isRecord$1(value)) return void 0;
	const normalized = {};
	for (const [rawModel, rawSelection] of Object.entries(value)) {
		const model = rawModel.trim();
		if (!model) continue;
		if (isImageCapabilityProfileId(rawSelection)) {
			normalized[model] = rawSelection;
			continue;
		}
		if (!isRecord$1(rawSelection)) continue;
		const byOperation = {};
		for (const operation of IMAGE_OPERATIONS) {
			const candidate = rawSelection[operation];
			if (isImageCapabilityProfileId(candidate) && IMAGE_CAPABILITY_PROFILES[candidate].operation === operation) byOperation[operation] = candidate;
		}
		if (Object.keys(byOperation).length) normalized[model] = byOperation;
	}
	return Object.keys(normalized).length ? normalized : void 0;
}
var IMAGE_OPERATIONS = [
	"generate",
	"edit",
	"variation",
	"responses-tool"
];
function profile(input) {
	return {
		...input,
		availability: input.availability || { state: "supported" },
		lifecycle: input.lifecycle || "active",
		advancedFields: input.advancedFields || unknownAdvancedFields(),
		storyIdentityReferenceStrategy: input.storyIdentityReferenceStrategy || "shot-angle",
		storyPromptConstraintStyle: input.storyPromptConstraintStyle || "explicit-exclusions"
	};
}
function evidence(kind, url, note) {
	return {
		kind,
		url,
		note
	};
}
function unsupported(reason) {
	return {
		state: "unsupported",
		reason
	};
}
function unknown(reason) {
	return {
		state: "unknown",
		reason
	};
}
function nativeBatch(min, max, note) {
	return {
		state: "supported",
		min,
		max,
		perRequestMax: max,
		transport: "native-batch",
		...note ? { note } : {}
	};
}
function clientFanout(max, note) {
	return {
		state: "supported",
		min: 1,
		max,
		perRequestMax: 1,
		transport: "client-fanout",
		...note ? { note } : {}
	};
}
function references(min, max, note) {
	return {
		state: "supported",
		min,
		max,
		ordered: true,
		...note ? { note } : {}
	};
}
function supportedMask(appliesTo, note) {
	return {
		state: "supported",
		appliesTo,
		...note ? { note } : {}
	};
}
function enumField(values, options = {}) {
	return {
		state: "supported",
		values,
		...options
	};
}
function dimensions(options) {
	return {
		state: "supported",
		kind: "dimensions",
		...options
	};
}
function enumSize(values, options = {}) {
	return {
		state: "supported",
		kind: "enum",
		values,
		...options
	};
}
function tierAndRatio(tiers, ratios, options = {}) {
	return {
		state: "supported",
		kind: "tier-and-ratio",
		tiers,
		ratios,
		...options
	};
}
function serialization(input) {
	return {
		quantityField: null,
		referenceField: null,
		maskField: null,
		sizeField: null,
		qualityField: null,
		outputFormatField: null,
		responseEncodingField: null,
		...input
	};
}
function unknownAdvancedFields() {
	return {
		negativePrompt: unknown("negativePrompt 未在该 profile 的已验证合同中"),
		steps: unknown("steps 未在该 profile 的已验证合同中"),
		cfgScale: unknown("CFG/guidance 未在该 profile 的已验证合同中"),
		seed: unknown("seed 未在该 profile 的已验证合同中"),
		sampler: unknown("sampler 未在该 profile 的已验证合同中"),
		scheduler: unknown("scheduler 未在该 profile 的已验证合同中"),
		sequential: unknown("sequential mode 未在该 profile 的已验证合同中"),
		clipSkip: unknown("clipSkip 未在该 profile 的已验证合同中"),
		loras: unknown("LoRA map 未在该 profile 的已验证合同中")
	};
}
function agnesProfile(id, operation, size, evidenceItems) {
	return profile({
		id,
		provider: "agnes",
		label: `Agnes Image ${id.includes("2.1") ? "2.1" : "2.0"} ${operation}`,
		operation,
		outputCount: clientFanout(null, "Agnes does not document n; requested multiple outputs must use independent single-output calls"),
		referenceCount: operation === "edit" ? references(1, null, "Official examples show multiple images but publish no maximum") : UNSUPPORTED_REFERENCES,
		mask: UNSUPPORTED_MASK,
		size,
		quality: UNSUPPORTED_QUALITY,
		outputFormat: UNKNOWN_OUTPUT_FORMAT,
		serialization: serialization({
			kind: "agnes-images-generate",
			endpoint: "/images/generations",
			referenceField: operation === "edit" ? "extra_body.image[]" : null,
			sizeField: id.includes("2.1") ? "size+ratio" : "size",
			responseEncodingField: "extra_body.response_format"
		}),
		storyIdentityReferenceStrategy: "shot-angle",
		storyPromptConstraintStyle: "positive-only",
		evidence: evidenceItems
	});
}
function dashscopeProfile(options) {
	return profile({
		id: options.id,
		provider: "dashscope",
		label: options.label,
		operation: options.operation,
		outputCount: options.outputCount,
		referenceCount: options.referenceCount,
		mask: UNSUPPORTED_MASK,
		size: options.size,
		quality: UNSUPPORTED_QUALITY,
		outputFormat: enumField(["png"], {
			requestable: false,
			note: "The verified contracts return PNG and expose no output-format request field"
		}),
		...options.advancedFields ? { advancedFields: options.advancedFields } : {},
		serialization: serialization({
			kind: "dashscope-multimodal-image",
			endpoint: "/services/aigc/multimodal-generation/generation",
			quantityField: options.quantityField,
			referenceField: options.operation === "edit" ? "input.messages[].content[].image" : null,
			sizeField: options.size.state === "unsupported" ? null : "parameters.size"
		}),
		evidence: options.evidence
	});
}
function arkProfile(id, operation) {
	return profile({
		id,
		provider: "ark",
		label: `Ark Seedream ${operation}`,
		operation,
		outputCount: clientFanout(null, "Direct quantity is not a generic n field; sequential image generation is a distinct provider mode"),
		referenceCount: operation === "edit" ? references(1, null, "Multiple input images are official, but a cross-version maximum is not encoded") : UNSUPPORTED_REFERENCES,
		mask: UNSUPPORTED_MASK,
		size: UNKNOWN_SIZE,
		quality: UNSUPPORTED_QUALITY,
		outputFormat: UNKNOWN_OUTPUT_FORMAT,
		serialization: serialization({
			kind: "ark-images-generate",
			endpoint: "/api/v3/images/generations",
			referenceField: operation === "edit" ? "image[]-json" : null,
			sizeField: "size",
			responseEncodingField: "response_format"
		}),
		evidence: [ARK_IMAGE_API, ARK_SEEDREAM_GUIDE]
	});
}
function miaohuaProfile(id, operation) {
	return profile({
		id,
		provider: "sensenova-miaohua",
		label: `SenseTime Miaohua standard ${operation}`,
		operation,
		outputCount: nativeBatch(1, 8),
		referenceCount: operation === "edit" ? references(1, 1) : UNSUPPORTED_REFERENCES,
		mask: UNSUPPORTED_MASK,
		size: MIAOHUA_SIZE,
		quality: UNSUPPORTED_QUALITY,
		outputFormat: enumField(["JPG", "PNG"]),
		serialization: serialization({
			kind: "sensenova-miaohua-image",
			endpoint: "/v1/imgenstd/imgen",
			quantityField: "samples",
			referenceField: operation === "edit" ? "img_url" : null,
			sizeField: "width+height",
			outputFormatField: "format"
		}),
		evidence: [SENSENOVA_MIAOHUA_DOC]
	});
}
function civitaiGenericProfile(id, operation) {
	const referenceCount = operation === "generate" ? unsupported(civitaiPureTextToImageReferenceMessage()) : operation === "variation" ? references(1, 1) : references(1, null, "The maximum must be resolved from the selected live service schema");
	return profile({
		id,
		provider: "civitai",
		label: `Civitai ${operation} service`,
		operation,
		outputCount: unknown("Civitai quantity limits are service-specific and require a resolved service"),
		referenceCount,
		mask: UNSUPPORTED_MASK,
		size: UNKNOWN_SIZE,
		quality: UNSUPPORTED_QUALITY,
		outputFormat: operation === "variation" ? unsupported("SDXL createVariant live OpenAPI 没有 outputFormat 字段") : enumField([
			"jpeg",
			"png",
			"webP"
		]),
		...operation === "variation" ? { advancedFields: CIVITAI_Z_ADVANCED_FIELDS } : {},
		serialization: serialization({
			kind: "civitai-workflow",
			endpoint: "/v2/consumer/workflows",
			referenceField: operation === "generate" ? null : operation === "variation" ? "image[]-json" : "images[]",
			outputFormatField: operation === "variation" ? null : "outputFormat"
		}),
		evidence: [CIVITAI_IMAGE_OPENAPI]
	});
}
function civitaiPureTextToImageReferenceMessage(serviceId = "") {
	return `schema 无 images[]，不会发送参考图以免上游 400。请改用 ${civitaiReferenceSiblingService(serviceId)}`;
}
function civitaiReferenceSiblingService(serviceId) {
	const id = String(serviceId || "").trim().toLowerCase();
	if (!id) return CIVITAI_KLEIN_OR_QWEN_EDIT;
	if (id.includes("/zimage/") || id.includes("/z-image/") || id.includes("/anima/") || id.includes("/ernie/")) return CIVITAI_KLEIN_OR_QWEN_EDIT;
	if (id.includes("/sdxl/") && !id.includes("createvariant")) return "image/sdcpp/sdxl/createVariant、image/flux1-kontext/pro 或 image/flux2/klein/editImage/9b";
	if (id.includes("/krea2/") && id.includes("createimage")) return "image/qwen/editImage/3.0-pro 或 image/flux2/klein/editImage/9b";
	if (id.includes("/sdcpp/qwen/20b/") && id.includes("createimage")) return "image/sdcpp/qwen/20b/editImage";
	if (id.includes("/fal/qwen2/") && id.includes("createimage")) return "image/fal/qwen2/editImage";
	if (id.includes("/qwen/createimage")) return "image/qwen/editImage/3.0-pro";
	if (id.includes("/grok/") && id.includes("createimage")) return "image/grok/v1.0/editImage";
	if (id.includes("/openai/") && id.includes("createimage")) return "image/openai/gpt-image-2/editImage";
	if (id.includes("/wan/") && id.includes("createimage")) return "image/wan/v2.7/fal/editImage";
	if (id.includes("/gemini/") && id.includes("createimage")) return CIVITAI_KLEIN_OR_QWEN_EDIT;
	if (id.includes("/comfy/flux1/") && id.includes("createimage")) return "image/comfy/flux1/createVariant";
	if (id.includes("/flux2/") && id.includes("createimage")) return "image/flux2/klein/editImage/9b";
	return CIVITAI_KLEIN_OR_QWEN_EDIT;
}
function isRecord$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
var VIDEO_GENERATION_PARAMETER_NAMES = [
	"duration",
	"frames",
	"fps",
	"resolution",
	"dimensions",
	"aspectRatio",
	"audio",
	"audioMode",
	"watermark",
	"returnLastFrame",
	"negativePrompt",
	"seed",
	"steps",
	"guidance",
	"sampler",
	"scheduler",
	"quantity",
	"modelVariant",
	"mode",
	"promptExpansion",
	"safetyChecker",
	"frameGuideStrength",
	"shift",
	"turbo",
	"usePro"
];
function defineVideoCapabilityProfiles(profiles) {
	return Object.fromEntries(Object.entries(profiles).map(([id, profile]) => [id, {
		autoCharacterDerivedViewPolicy: "disabled",
		videoInputPolicy: { supported: false },
		...profile
	}]));
}
var VIDEO_CAPABILITY_PROFILES = defineVideoCapabilityProfiles({
	"agnes-video-v2": {
		id: "agnes-video-v2",
		provider: "agnes",
		label: "Agnes Video v2",
		supportsFirstFrame: true,
		supportsFirstLastFrame: true,
		supportsKeyframeSequence: true,
		keyframeImageMinimum: 2,
		keyframeImageLimit: 3,
		referenceImagePolicy: { supported: false },
		supportsReferenceSetWithFirst: false,
		storyAutoReferencePolicy: "current-shot",
		supportedOperations: [
			"text-to-video",
			"image-to-video",
			"first-last-frame-to-video",
			"keyframes-to-video"
		],
		intentPolicy: "keyframes"
	},
	"agnes-unknown": {
		id: "agnes-unknown",
		provider: "agnes",
		label: "Agnes 未知视频模型",
		supportsFirstFrame: false,
		supportsFirstLastFrame: false,
		referenceImagePolicy: { supported: false },
		supportsReferenceSetWithFirst: false,
		requiresExplicitProfile: true,
		intentPolicy: "none"
	},
	"dashscope-wan27-i2v": {
		id: "dashscope-wan27-i2v",
		provider: "dashscope",
		label: "DashScope Wan2.7 I2V",
		supportsFirstFrame: true,
		supportsFirstLastFrame: true,
		referenceImagePolicy: { supported: false },
		videoInputPolicy: {
			supported: true,
			min: 0,
			max: 1,
			uses: ["first_clip"]
		},
		storyAutoReferencePolicy: "current-shot",
		supportsReferenceSetWithFirst: false,
		supportedOperations: [
			"image-to-video",
			"first-last-frame-to-video",
			"continuation"
		],
		intentPolicy: "i2v"
	},
	"dashscope-wan26-i2v": {
		id: "dashscope-wan26-i2v",
		provider: "dashscope",
		label: "DashScope Wan2.6 I2V",
		supportsFirstFrame: true,
		supportsFirstLastFrame: false,
		referenceImagePolicy: { supported: false },
		storyAutoReferencePolicy: "current-shot",
		supportsReferenceSetWithFirst: false,
		intentPolicy: "i2v"
	},
	"dashscope-wan-kf2v": {
		id: "dashscope-wan-kf2v",
		provider: "dashscope",
		label: "DashScope Wan KF2V",
		supportsFirstFrame: true,
		supportsFirstLastFrame: true,
		requiresFirstLastFrame: true,
		referenceImagePolicy: { supported: false },
		storyAutoReferencePolicy: "current-shot",
		supportsReferenceSetWithFirst: false,
		supportedOperations: ["first-last-frame-to-video"],
		intentPolicy: "i2v"
	},
	"dashscope-wan27-r2v": {
		id: "dashscope-wan27-r2v",
		provider: "dashscope",
		label: "DashScope Wan2.7 R2V",
		supportsFirstFrame: false,
		supportsFirstLastFrame: false,
		referenceImagePolicy: {
			supported: true,
			min: 1,
			max: 5
		},
		videoInputPolicy: {
			supported: true,
			min: 0,
			max: 5,
			uses: ["reference_video"]
		},
		sharedImageVideoMaximum: 5,
		legacyUndefinedVideoUseAs: "reference_video",
		autoCharacterDerivedViewPolicy: "multi-view",
		supportsReferenceSetWithFirst: true,
		intentPolicy: "r2v-with-first"
	},
	"dashscope-wan26-r2v": {
		id: "dashscope-wan26-r2v",
		provider: "dashscope",
		label: "DashScope Wan2.6 R2V",
		supportsFirstFrame: false,
		supportsFirstLastFrame: false,
		referenceImagePolicy: {
			supported: true,
			min: 0,
			max: 5
		},
		videoInputPolicy: {
			supported: true,
			min: 0,
			max: 3,
			uses: ["reference_video"]
		},
		sharedImageVideoMaximum: 5,
		legacyUndefinedVideoUseAs: "reference_video",
		autoCharacterDerivedViewPolicy: "multi-view",
		storyAutoReferencePolicy: "semantic-references",
		supportsReferenceSetWithFirst: false,
		intentPolicy: "reference-set"
	},
	"dashscope-happyhorse-i2v": {
		id: "dashscope-happyhorse-i2v",
		provider: "dashscope",
		label: "DashScope HappyHorse I2V",
		supportsFirstFrame: true,
		supportsFirstLastFrame: false,
		referenceImagePolicy: { supported: false },
		storyAutoReferencePolicy: "current-shot",
		supportsReferenceSetWithFirst: false,
		intentPolicy: "i2v"
	},
	"dashscope-happyhorse-r2v": {
		id: "dashscope-happyhorse-r2v",
		provider: "dashscope",
		label: "DashScope HappyHorse R2V",
		supportsFirstFrame: false,
		supportsFirstLastFrame: false,
		referenceImagePolicy: {
			supported: true,
			min: 1,
			max: 9
		},
		autoCharacterDerivedViewPolicy: "multi-view",
		storyAutoReferencePolicy: "semantic-references",
		supportsReferenceSetWithFirst: false,
		intentPolicy: "reference-set"
	},
	"dashscope-wan27-video-edit": {
		id: "dashscope-wan27-video-edit",
		provider: "dashscope",
		label: "DashScope Wan2.7 VideoEdit",
		supportsFirstFrame: false,
		supportsFirstLastFrame: false,
		referenceImagePolicy: {
			supported: true,
			min: 0,
			max: 4
		},
		videoInputPolicy: {
			supported: true,
			min: 1,
			max: 1,
			uses: ["source_video"]
		},
		storyAutoReferencePolicy: "disabled",
		supportsReferenceSetWithFirst: false,
		intentPolicy: "reference-set",
		supportedOperations: ["video-edit"]
	},
	"dashscope-happyhorse-video-edit": {
		id: "dashscope-happyhorse-video-edit",
		provider: "dashscope",
		label: "DashScope HappyHorse Video Edit",
		supportsFirstFrame: false,
		supportsFirstLastFrame: false,
		referenceImagePolicy: {
			supported: true,
			min: 0,
			max: 5
		},
		videoInputPolicy: {
			supported: true,
			min: 1,
			max: 1,
			uses: ["source_video"]
		},
		storyAutoReferencePolicy: "disabled",
		supportsReferenceSetWithFirst: false,
		intentPolicy: "reference-set",
		supportedOperations: ["video-edit"]
	},
	"dashscope-t2v": {
		id: "dashscope-t2v",
		provider: "dashscope",
		label: "DashScope T2V",
		supportsFirstFrame: false,
		supportsFirstLastFrame: false,
		referenceImagePolicy: { supported: false },
		storyAutoReferencePolicy: "current-shot",
		supportsReferenceSetWithFirst: false,
		intentPolicy: "none"
	},
	"dashscope-unknown": {
		id: "dashscope-unknown",
		provider: "dashscope",
		label: "DashScope 未知视频模型",
		supportsFirstFrame: false,
		supportsFirstLastFrame: false,
		referenceImagePolicy: { supported: false },
		supportsReferenceSetWithFirst: false,
		requiresExplicitProfile: true,
		intentPolicy: "none"
	},
	"ark-seedance-2": {
		id: "ark-seedance-2",
		provider: "ark",
		label: "Ark Seedance 2.0",
		supportsFirstFrame: true,
		supportsFirstLastFrame: true,
		referenceImagePolicy: {
			supported: true,
			min: 1,
			max: 9
		},
		videoInputPolicy: {
			supported: true,
			min: 0,
			max: 3,
			uses: ["reference_video"]
		},
		autoCharacterDerivedViewPolicy: "multi-view",
		storyAutoReferencePolicy: "semantic-references",
		supportsReferenceSetWithFirst: false,
		supportedOperations: [
			"text-to-video",
			"image-to-video",
			"first-last-frame-to-video",
			"reference-to-video"
		],
		intentPolicy: "frames-or-reference-set"
	},
	"ark-seedance-2-fast": {
		id: "ark-seedance-2-fast",
		provider: "ark",
		label: "Ark Seedance 2.0 Fast",
		supportsFirstFrame: true,
		supportsFirstLastFrame: true,
		referenceImagePolicy: {
			supported: true,
			min: 1,
			max: 9
		},
		videoInputPolicy: {
			supported: true,
			min: 0,
			max: 3,
			uses: ["reference_video"]
		},
		autoCharacterDerivedViewPolicy: "multi-view",
		storyAutoReferencePolicy: "semantic-references",
		supportsReferenceSetWithFirst: false,
		supportedOperations: [
			"text-to-video",
			"image-to-video",
			"first-last-frame-to-video",
			"reference-to-video"
		],
		intentPolicy: "frames-or-reference-set"
	},
	"ark-seedance-2-mini": {
		id: "ark-seedance-2-mini",
		provider: "ark",
		label: "Ark Seedance 2.0 Mini",
		supportsFirstFrame: true,
		supportsFirstLastFrame: true,
		referenceImagePolicy: {
			supported: true,
			min: 1,
			max: 9
		},
		videoInputPolicy: {
			supported: true,
			min: 0,
			max: 3,
			uses: ["reference_video"]
		},
		autoCharacterDerivedViewPolicy: "multi-view",
		storyAutoReferencePolicy: "semantic-references",
		supportsReferenceSetWithFirst: false,
		supportedOperations: [
			"text-to-video",
			"image-to-video",
			"first-last-frame-to-video",
			"reference-to-video"
		],
		intentPolicy: "frames-or-reference-set"
	},
	"ark-seedance-1-0-pro-fast": {
		id: "ark-seedance-1-0-pro-fast",
		provider: "ark",
		label: "Ark Seedance 1.0 Pro Fast",
		supportsFirstFrame: true,
		supportsFirstLastFrame: false,
		referenceImagePolicy: { supported: false },
		storyAutoReferencePolicy: "current-shot",
		supportsReferenceSetWithFirst: false,
		supportedOperations: ["text-to-video", "image-to-video"],
		intentPolicy: "i2v"
	},
	"ark-seedance-legacy": {
		id: "ark-seedance-legacy",
		provider: "ark",
		label: "Ark Seedance 1.x",
		supportsFirstFrame: true,
		supportsFirstLastFrame: true,
		referenceImagePolicy: { supported: false },
		storyAutoReferencePolicy: "current-shot",
		supportsReferenceSetWithFirst: false,
		intentPolicy: "i2v"
	},
	"ark-unknown": {
		id: "ark-unknown",
		provider: "ark",
		label: "Ark 未知 Endpoint",
		supportsFirstFrame: false,
		supportsFirstLastFrame: false,
		referenceImagePolicy: { supported: false },
		supportsReferenceSetWithFirst: false,
		requiresExplicitProfile: true,
		intentPolicy: "none"
	},
	"civitai-text-video": {
		id: "civitai-text-video",
		provider: "civitai",
		label: "Civitai Text-to-Video",
		supportsFirstFrame: false,
		supportsFirstLastFrame: false,
		referenceImagePolicy: { supported: false },
		storyAutoReferencePolicy: "current-shot",
		supportsReferenceSetWithFirst: false,
		intentPolicy: "none"
	},
	"civitai-i2v": {
		id: "civitai-i2v",
		provider: "civitai",
		label: "Civitai Image-to-Video",
		supportsFirstFrame: true,
		supportsFirstLastFrame: false,
		referenceImagePolicy: { supported: false },
		storyAutoReferencePolicy: "current-shot",
		supportsReferenceSetWithFirst: false,
		intentPolicy: "i2v"
	},
	"civitai-first-last": {
		id: "civitai-first-last",
		provider: "civitai",
		label: "Civitai First/Last Frame Video",
		supportsFirstFrame: true,
		supportsFirstLastFrame: true,
		referenceImagePolicy: { supported: false },
		storyAutoReferencePolicy: "current-shot",
		supportsReferenceSetWithFirst: false,
		intentPolicy: "i2v"
	},
	"civitai-source-images": {
		id: "civitai-source-images",
		provider: "civitai",
		label: "Civitai Source Images",
		supportsFirstFrame: true,
		supportsFirstLastFrame: false,
		referenceImagePolicy: {
			supported: true,
			min: 1,
			max: null
		},
		supportsReferenceSetWithFirst: false,
		autoCharacterDerivedViewPolicy: "multi-view",
		storyAutoReferencePolicy: "semantic-references",
		intentPolicy: "frames-or-reference-set"
	},
	"civitai-untyped-images": {
		id: "civitai-untyped-images",
		provider: "civitai",
		label: "Civitai Untyped Images",
		supportsFirstFrame: false,
		supportsFirstLastFrame: false,
		referenceImagePolicy: {
			supported: true,
			min: 1,
			max: null
		},
		supportsReferenceSetWithFirst: false,
		autoCharacterDerivedViewPolicy: "multi-view",
		storyAutoReferencePolicy: "semantic-references",
		intentPolicy: "reference-set"
	},
	"civitai-reference-images": {
		id: "civitai-reference-images",
		provider: "civitai",
		label: "Civitai Reference-to-Video",
		supportsFirstFrame: false,
		supportsFirstLastFrame: false,
		referenceImagePolicy: {
			supported: true,
			min: 1,
			max: null
		},
		autoCharacterDerivedViewPolicy: "multi-view",
		storyAutoReferencePolicy: "semantic-references",
		supportsReferenceSetWithFirst: false,
		intentPolicy: "reference-set"
	},
	"civitai-reference-videos": {
		id: "civitai-reference-videos",
		provider: "civitai",
		label: "Civitai Reference Videos",
		supportsFirstFrame: false,
		supportsFirstLastFrame: false,
		referenceImagePolicy: { supported: false },
		videoInputPolicy: {
			supported: true,
			min: 1,
			max: 3,
			uses: ["reference_video"]
		},
		storyAutoReferencePolicy: "disabled",
		supportsReferenceSetWithFirst: false,
		supportedOperations: ["reference-to-video"],
		intentPolicy: "none"
	},
	"civitai-happyhorse-r2v": {
		id: "civitai-happyhorse-r2v",
		provider: "civitai",
		label: "Civitai HappyHorse 1.1 R2V",
		supportsFirstFrame: false,
		supportsFirstLastFrame: false,
		referenceImagePolicy: {
			supported: true,
			min: 1,
			max: null
		},
		autoCharacterDerivedViewPolicy: "multi-view",
		storyAutoReferencePolicy: "semantic-references",
		supportsReferenceSetWithFirst: false,
		intentPolicy: "reference-set"
	},
	"civitai-frames-or-references": {
		id: "civitai-frames-or-references",
		provider: "civitai",
		label: "Civitai Frames or Reference Images",
		supportsFirstFrame: true,
		supportsFirstLastFrame: true,
		referenceImagePolicy: {
			supported: true,
			min: 1,
			max: null
		},
		autoCharacterDerivedViewPolicy: "multi-view",
		storyAutoReferencePolicy: "semantic-references",
		supportsReferenceSetWithFirst: false,
		intentPolicy: "frames-or-reference-set"
	},
	"civitai-multimodal": {
		id: "civitai-multimodal",
		provider: "civitai",
		label: "Civitai Multimodal Video",
		supportsFirstFrame: true,
		supportsFirstLastFrame: true,
		referenceImagePolicy: {
			supported: true,
			min: 1,
			max: null
		},
		autoCharacterDerivedViewPolicy: "multi-view",
		storyAutoReferencePolicy: "semantic-references",
		supportsReferenceSetWithFirst: true,
		supportsReferenceSetWithFrames: true,
		intentPolicy: "reference-set-with-frames"
	},
	"civitai-unknown": {
		id: "civitai-unknown",
		provider: "civitai",
		label: "Civitai 未知动态视频服务",
		supportsFirstFrame: false,
		supportsFirstLastFrame: false,
		referenceImagePolicy: { supported: false },
		supportsReferenceSetWithFirst: false,
		requiresExplicitProfile: true,
		intentPolicy: "none"
	},
	"openai-video": {
		id: "openai-video",
		provider: "openai",
		label: "OpenAI-compatible Video",
		supportsFirstFrame: true,
		supportsFirstLastFrame: false,
		referenceImagePolicy: { supported: false },
		storyAutoReferencePolicy: "current-shot",
		supportsReferenceSetWithFirst: false,
		supportedOperations: ["text-to-video", "image-to-video"],
		intentPolicy: "single-frame"
	},
	"openai-unknown": {
		id: "openai-unknown",
		provider: "openai",
		label: "OpenAI-compatible 未知视频模型",
		supportsFirstFrame: false,
		supportsFirstLastFrame: false,
		referenceImagePolicy: { supported: false },
		supportsReferenceSetWithFirst: false,
		requiresExplicitProfile: true,
		intentPolicy: "none"
	}
});
var STRICT_SCHEMA_EVIDENCE = "精确请求 schema 未声明该字段；非空值会被拒绝，不能透传或猜测";
var UNPUBLISHED_EVIDENCE = "当前官方资料没有公布可执行字段合同；非空值会被拒绝，不能按其他 provider 猜测";
function unavailableParameter(status, description) {
	return {
		status,
		description: description || (status === "unsupported" ? STRICT_SCHEMA_EVIDENCE : status === "conflict" ? "官方资料存在冲突；在冲突解除前拒绝非空值" : UNPUBLISHED_EVIDENCE)
	};
}
function supportedParameter(valueType, transportName, description, options = {}) {
	return {
		status: "supported",
		valueType,
		transportName,
		description,
		...options
	};
}
function makeVideoGenerationParameterContract(id, evidence, defaultStatus, fields, options = {}) {
	return {
		id,
		evidence,
		strict: true,
		...Object.fromEntries(VIDEO_GENERATION_PARAMETER_NAMES.map((name) => [name, unavailableParameter(defaultStatus)])),
		...fields,
		...options
	};
}
var AGNES_VIDEO_EVIDENCE = ["https://agnes-ai.com/en/docs/agnes-video-v20 (verified 2026-08-03)"];
var OPENAI_VIDEO_EVIDENCE = ["https://developers.openai.com/api/reference/resources/videos/methods/create (verified 2026-08-03)"];
var DASHSCOPE_WAN27_I2V_EVIDENCE = ["https://help.aliyun.com/en/model-studio/image-to-video-general-api-reference (verified 2026-08-03)"];
var DASHSCOPE_WAN27_R2V_EVIDENCE = ["https://help.aliyun.com/en/model-studio/wan-video-to-video-api-reference (verified 2026-08-03)"];
var DASHSCOPE_WAN_T2V_EVIDENCE = ["https://help.aliyun.com/en/model-studio/text-to-video-api-reference (verified 2026-08-03)"];
var DASHSCOPE_WAN25_PREVIEW_EVIDENCE = ["https://help.aliyun.com/zh/model-studio/legacy-wan-text-to-video-api-reference (verified 2026-08-14; wan2.5-t2v-preview/wan2.5-i2v-preview use the legacy protocol, duration enum 5|10 seconds, resolution 480P|720P|1080P; i2v takes a single img_url first frame)"];
var DASHSCOPE_WAN_KF2V_EVIDENCE = ["https://help.aliyun.com/en/model-studio/legacy-image-to-video-by-first-and-last-frame-api-reference (verified 2026-08-03)"];
var DASHSCOPE_HAPPYHORSE_I2V_EVIDENCE = ["https://help.aliyun.com/en/model-studio/happyhorse-image-to-video-api-reference (verified 2026-08-03)"];
var DASHSCOPE_HAPPYHORSE_R2V_EVIDENCE = ["https://help.aliyun.com/en/model-studio/happyhorse-reference-to-video-api-reference (verified 2026-08-03)"];
var DASHSCOPE_HAPPYHORSE_T2V_EVIDENCE = ["https://www.alibabacloud.com/help/en/model-studio/happyhorse-text-to-video-api-reference (verified 2026-08-04; request body lists 1.0 and 1.1, resolution/ratio/seed/watermark for both, and explicitly states 1.0 duration 3..15)", "https://www.alibabacloud.com/help/en/model-studio/newly-released-models (verified 2026-08-04; 2026-06-22 lifecycle entry explicitly states HappyHorse 1.1 T2V supports 3..15 seconds at 720P/1080P)"];
var DASHSCOPE_HAPPYHORSE_10_I2V_EVIDENCE = ["https://www.alibabacloud.com/help/en/model-studio/happyhorse-image-to-video-api-reference (verified 2026-08-04; request body lists happyhorse-1.0-i2v and 1.1-i2v as allowed models, with one first_frame and shared resolution/duration/watermark/seed fields)"];
var DASHSCOPE_HAPPYHORSE_10_R2V_EVIDENCE = ["https://www.alibabacloud.com/help/en/model-studio/happyhorse-reference-to-video-api-reference (verified 2026-08-04; request body lists happyhorse-1.0-r2v and 1.1-r2v as allowed models, with 1..9 reference_image inputs and shared resolution/ratio/duration/watermark/seed fields)"];
var DASHSCOPE_HAPPYHORSE_10_T2V_EVIDENCE = ["https://www.alibabacloud.com/help/en/model-studio/happyhorse-text-to-video-api-reference (verified 2026-08-04; request body lists happyhorse-1.0-t2v and 1.1-t2v as allowed models; it explicitly gives 1.0 duration 3..15 and shared resolution/ratio/watermark/seed fields)"];
var DASHSCOPE_WAN27_VIDEO_EDIT_EVIDENCE = ["https://help.aliyun.com/en/model-studio/wan-video-editing-api-reference (verified 2026-08-04)"];
var DASHSCOPE_HAPPYHORSE_VIDEO_EDIT_EVIDENCE = ["https://help.aliyun.com/en/model-studio/happyhorse-video-edit-api-reference (verified 2026-08-04)"];
var ARK_VIDEO_EVIDENCE = ["https://api.volcengine.com/api-docs/view?action=CreateContentsGenerationsTasks&serviceCode=ark&version=2024-01-01 (verified 2026-08-03; public model-level parameter schema incomplete)"];
var ARK_SEEDANCE_2_EVIDENCE = [
	"https://docs.volcengine.com/docs/82379/1520757 (verified 2026-08-09; official create-task contract, metadata updated 2026-08-07T10:44:45Z)",
	"https://docs.volcengine.com/docs/82379/2291680 (verified 2026-08-09; official Seedance 2.0 series API tutorial and model-variant operation matrix)",
	"https://www.volcengine.com/activity/seedance2 (verified 2026-08-09; standard and mini model variants, multimodal generation, 4..15 seconds, and per-variant resolutions)",
	"https://developer.volcengine.com/articles/7641782568258306102 (verified 2026-08-09; official Ark example uses ordered reference images, 15 seconds, 720p, ratio, and generate_audio)",
	"https://www.volcengine.com/docs/82379/2315856?lang=en (verified 2026-08-09; Ark Seedance 2 content item role reference_image)",
	"https://api.volcengine.com/api-docs/view?action=CreateContentsGenerationsTasks&serviceCode=ark&version=2024-01-01 (verified 2026-08-09; content request and return_last_frame transport)"
];
makeVideoGenerationParameterContract("agnes:agnes-video-v2.0", AGNES_VIDEO_EVIDENCE, "unpublished", {
	duration: supportedParameter("integer", "num_frames / frame_rate（仅 UI）", "API 没有 seconds 字段；UI 以 num_frames / frame_rate 的四舍五入结果显示“约 N 秒”，不会把 duration 发送到 API", {
		minimum: 1,
		derivedFrom: ["frames", "fps"]
	}),
	frames: supportedParameter("integer", "num_frames", "最大 441 帧，且帧数必须满足 8n+1", {
		minimum: 1,
		maximum: 441,
		integer: true,
		offsetMultiple: {
			offset: 1,
			multiple: 8
		}
	}),
	fps: supportedParameter("number", "frame_rate", "官方列为 number，范围 1..60；未公布精度限制，按输入原样发送", {
		minimum: 1,
		maximum: 60
	}),
	dimensions: supportedParameter("dimensions", "width/height", "width、height 为整数；官方未公布数值边界，服务会按其尺寸映射处理", { integer: true }),
	aspectRatio: unavailableParameter("unpublished", "官方参数表仅公布 width/height，未公布 ratio 或 aspect_ratio；不会猜测尺寸"),
	negativePrompt: supportedParameter("string", "negative_prompt", "官方请求字段 negative_prompt"),
	seed: supportedParameter("integer", "seed", "官方请求字段 seed；未公布数值范围", { integer: true }),
	steps: supportedParameter("integer", "num_inference_steps", "官方请求字段 num_inference_steps；未公布数值范围", { integer: true }),
	resolution: unavailableParameter("unsupported", "Agnes 创建请求使用 width/height，不接受通用 resolution 档位字段")
});
makeVideoGenerationParameterContract("openai:videos-create", OPENAI_VIDEO_EVIDENCE, "unsupported", {
	duration: supportedParameter("integer", "seconds", "官方 seconds 枚举；HTTP 传输为字符串", {
		enumValues: [
			4,
			8,
			12
		],
		defaultValue: 4,
		integer: true
	}),
	dimensions: supportedParameter("dimensions", "size", "官方 size 枚举", {
		enumValues: [
			"720x1280",
			"1280x720",
			"1024x1792",
			"1792x1024"
		],
		defaultValue: "720x1280"
	}),
	aspectRatio: unavailableParameter("unsupported", "OpenAI Videos 没有 aspect_ratio 字段；应从 size 枚举选择方向"),
	resolution: unavailableParameter("unsupported", "OpenAI Videos 没有独立 resolution 档位字段；应使用 size")
});
var DASHSCOPE_SEED = supportedParameter("integer", "seed", "随机种子 0..2147483647", {
	minimum: 0,
	maximum: 2147483647,
	integer: true
});
var DASHSCOPE_WATERMARK = supportedParameter("boolean", "watermark", "是否添加 provider 水印");
var DASHSCOPE_NEGATIVE_PROMPT = supportedParameter("string", "negative_prompt", "负面提示词，最长 500 字符", { maxLength: 500 });
var DASHSCOPE_PROMPT_EXPANSION = supportedParameter("boolean", "prompt_extend", "是否启用提示词扩写");
var DASHSCOPE_FIXED_30_FPS = unavailableParameter("unsupported", "输出固定为 30fps，官方请求合同没有可配置 fps 字段");
var DASHSCOPE_VIDEO_RATIOS = [
	"16:9",
	"9:16",
	"1:1",
	"4:3",
	"3:4"
];
var HAPPYHORSE_VIDEO_RATIOS = [
	"16:9",
	"9:16",
	"3:4",
	"4:3",
	"4:5",
	"5:4",
	"1:1",
	"9:21",
	"21:9"
];
function dashscopeWan27GenerationParameters(kind) {
	const evidence = kind === "i2v" ? DASHSCOPE_WAN27_I2V_EVIDENCE : kind === "r2v" ? DASHSCOPE_WAN27_R2V_EVIDENCE : DASHSCOPE_WAN_T2V_EVIDENCE;
	return makeVideoGenerationParameterContract(`dashscope:wan2.7-${kind}`, evidence, "unsupported", {
		duration: supportedParameter("integer", "parameters.duration", kind === "r2v" ? "整数 2..15；含参考视频时最大 10" : "整数 2..15", {
			minimum: 2,
			maximum: 15,
			integer: true,
			defaultValue: 5
		}),
		fps: DASHSCOPE_FIXED_30_FPS,
		resolution: supportedParameter("string", "parameters.resolution", "分辨率档位", {
			enumValues: ["720P", "1080P"],
			defaultValue: "1080P"
		}),
		aspectRatio: kind === "i2v" ? unavailableParameter("unsupported", "I2V 输出比例跟随首帧或首段视频，不接受 ratio 参数") : supportedParameter("string", "parameters.ratio", "输出画面比例；R2V 有首帧时该字段会被 provider 忽略", {
			enumValues: DASHSCOPE_VIDEO_RATIOS,
			defaultValue: "16:9"
		}),
		audio: kind === "r2v" ? supportedParameter("string-array", "input.media[].reference_voice", "每个主体参考可选独立 reference_voice；数量由参考素材合同约束") : supportedParameter("string", kind === "i2v" ? "input.media[type=driving_audio].url" : "input.audio_url", "WAV/MP3 音频 URL；具体时长和大小仍由媒体预检校验"),
		watermark: DASHSCOPE_WATERMARK,
		negativePrompt: DASHSCOPE_NEGATIVE_PROMPT,
		seed: DASHSCOPE_SEED,
		promptExpansion: DASHSCOPE_PROMPT_EXPANSION
	}, kind === "r2v" ? { durationMaximumWhenReferenceVideo: 10 } : {});
}
dashscopeWan27GenerationParameters("i2v");
dashscopeWan27GenerationParameters("r2v");
dashscopeWan27GenerationParameters("t2v");
makeVideoGenerationParameterContract("dashscope:wan2.5-t2v-preview", DASHSCOPE_WAN25_PREVIEW_EVIDENCE, "unsupported", {
	duration: supportedParameter("integer", "parameters.duration", "枚举 5 或 10 秒", {
		enumValues: [5, 10],
		integer: true,
		defaultValue: 5
	}),
	resolution: supportedParameter("string", "parameters.resolution", "分辨率档位 480P/720P/1080P", { enumValues: [
		"480P",
		"720P",
		"1080P"
	] })
});
makeVideoGenerationParameterContract("dashscope:wan2.5-i2v-preview", DASHSCOPE_WAN25_PREVIEW_EVIDENCE, "unsupported", {
	duration: supportedParameter("integer", "parameters.duration", "枚举 5 或 10 秒", {
		enumValues: [5, 10],
		integer: true,
		defaultValue: 5
	}),
	resolution: supportedParameter("string", "parameters.resolution", "分辨率档位 480P/720P/1080P", { enumValues: [
		"480P",
		"720P",
		"1080P"
	] })
});
makeVideoGenerationParameterContract("dashscope:wan2.2-kf2v-flash", DASHSCOPE_WAN_KF2V_EVIDENCE, "unsupported", {
	duration: supportedParameter("integer", "parameters.duration", "固定 5 秒", {
		enumValues: [5],
		integer: true,
		defaultValue: 5
	}),
	resolution: supportedParameter("string", "parameters.resolution", "Wan2.2 KF2V 分辨率档位", {
		enumValues: [
			"480P",
			"720P",
			"1080P"
		],
		defaultValue: "720P"
	}),
	aspectRatio: unavailableParameter("unsupported", "输出比例跟随首帧，不接受 ratio 参数"),
	watermark: DASHSCOPE_WATERMARK,
	negativePrompt: DASHSCOPE_NEGATIVE_PROMPT,
	seed: DASHSCOPE_SEED,
	promptExpansion: DASHSCOPE_PROMPT_EXPANSION
});
function dashscopeHappyHorseGenerationParameters(version, kind) {
	const evidence = version === "1.0" ? kind === "i2v" ? DASHSCOPE_HAPPYHORSE_10_I2V_EVIDENCE : kind === "r2v" ? DASHSCOPE_HAPPYHORSE_10_R2V_EVIDENCE : DASHSCOPE_HAPPYHORSE_10_T2V_EVIDENCE : kind === "i2v" ? DASHSCOPE_HAPPYHORSE_I2V_EVIDENCE : kind === "r2v" ? DASHSCOPE_HAPPYHORSE_R2V_EVIDENCE : DASHSCOPE_HAPPYHORSE_T2V_EVIDENCE;
	return makeVideoGenerationParameterContract(`dashscope:happyhorse-${version}-${kind}`, evidence, "unsupported", {
		duration: supportedParameter("integer", "parameters.duration", "整数 3..15", {
			minimum: 3,
			maximum: 15,
			integer: true,
			defaultValue: 5
		}),
		fps: unavailableParameter("unsupported", "输出为 24fps，官方请求合同没有可配置 fps 字段"),
		resolution: supportedParameter("string", "parameters.resolution", "分辨率档位", {
			enumValues: ["720P", "1080P"],
			defaultValue: "1080P"
		}),
		aspectRatio: kind === "i2v" ? unavailableParameter("unsupported", "HappyHorse I2V 输出比例跟随首帧，不支持 ratio") : supportedParameter("string", "parameters.ratio", "输出画面比例", {
			enumValues: HAPPYHORSE_VIDEO_RATIOS,
			defaultValue: "16:9"
		}),
		watermark: DASHSCOPE_WATERMARK,
		seed: DASHSCOPE_SEED
	});
}
dashscopeHappyHorseGenerationParameters("1.1", "i2v");
dashscopeHappyHorseGenerationParameters("1.1", "r2v");
dashscopeHappyHorseGenerationParameters("1.1", "t2v");
dashscopeHappyHorseGenerationParameters("1.0", "i2v");
dashscopeHappyHorseGenerationParameters("1.0", "r2v");
dashscopeHappyHorseGenerationParameters("1.0", "t2v");
makeVideoGenerationParameterContract("dashscope:wan2.7-videoedit", DASHSCOPE_WAN27_VIDEO_EDIT_EVIDENCE, "unsupported", {
	duration: supportedParameter("integer", "parameters.duration", "0 表示跟随源视频；2..10 表示从开头截断", {
		enumValues: [
			0,
			2,
			3,
			4,
			5,
			6,
			7,
			8,
			9,
			10
		],
		integer: true,
		defaultValue: 0
	}),
	resolution: supportedParameter("string", "parameters.resolution", "输出分辨率档位", {
		enumValues: ["720P", "1080P"],
		defaultValue: "1080P"
	}),
	aspectRatio: supportedParameter("string", "parameters.ratio", "留空跟随源视频；显式值重设比例", { enumValues: DASHSCOPE_VIDEO_RATIOS }),
	audioMode: supportedParameter("string", "parameters.audio_setting", "auto 智能决定；origin 强制保留源音频", {
		enumValues: ["auto", "origin"],
		defaultValue: "auto"
	}),
	watermark: DASHSCOPE_WATERMARK,
	negativePrompt: DASHSCOPE_NEGATIVE_PROMPT,
	seed: DASHSCOPE_SEED,
	promptExpansion: DASHSCOPE_PROMPT_EXPANSION
});
makeVideoGenerationParameterContract("dashscope:happyhorse-1.0-video-edit", DASHSCOPE_HAPPYHORSE_VIDEO_EDIT_EVIDENCE, "unsupported", {
	resolution: supportedParameter("string", "parameters.resolution", "输出分辨率档位", {
		enumValues: ["720P", "1080P"],
		defaultValue: "1080P"
	}),
	audioMode: supportedParameter("string", "parameters.audio_setting", "auto 由模型决定；origin 保留源音频", {
		enumValues: ["auto", "origin"],
		defaultValue: "auto"
	}),
	watermark: DASHSCOPE_WATERMARK,
	seed: DASHSCOPE_SEED
});
makeVideoGenerationParameterContract("ark:public-model-schema-incomplete", ARK_VIDEO_EVIDENCE, "unpublished", {});
var ARK_SEEDANCE_2_RATIOS = [
	"21:9",
	"16:9",
	"4:3",
	"1:1",
	"3:4",
	"9:16",
	"adaptive"
];
var ARK_SEEDANCE_2_DURATIONS = [
	-1,
	4,
	5,
	6,
	7,
	8,
	9,
	10,
	11,
	12,
	13,
	14,
	15
];
function arkSeedance2GenerationParameters(variant, resolutions) {
	return makeVideoGenerationParameterContract(`ark:seedance-2.0-${variant}`, ARK_SEEDANCE_2_EVIDENCE, "unsupported", {
		duration: supportedParameter("integer", "duration", "-1 表示智能时长；或整数 4..15 秒", {
			enumValues: ARK_SEEDANCE_2_DURATIONS,
			integer: true
		}),
		resolution: supportedParameter("string", "resolution", `${variant} 变体的官方分辨率枚举`, { enumValues: resolutions }),
		aspectRatio: supportedParameter("string", "ratio", "输出画面比例", { enumValues: ARK_SEEDANCE_2_RATIOS }),
		audio: supportedParameter("boolean", "generate_audio", "是否生成同步音频", { defaultValue: true }),
		watermark: supportedParameter("boolean", "watermark", "是否添加水印", { defaultValue: false }),
		returnLastFrame: supportedParameter("boolean", "return_last_frame", "是否在任务结果中返回无水印尾帧", { defaultValue: false })
	});
}
arkSeedance2GenerationParameters("standard", [
	"480p",
	"720p",
	"1080p",
	"4k"
]);
arkSeedance2GenerationParameters("fast", ["480p", "720p"]);
arkSeedance2GenerationParameters("mini", ["480p", "720p"]);
var CIVITAI_VIDEO_EVIDENCE = ["https://orchestration.civitai.com/v2/consumer/recipes/videoGen/openapi.json (SHA-256 4e59dbe90eccad8d8666e5ce98ef9ec8049c30ecb313a166a4ca2f677453a33b, verified 2026-08-03)"];
var CIVITAI_WAN26_R2V_EVIDENCE = ["https://github.com/civitai/civitai-comfy-nodes/blob/80ef09a51b70fe8aca750c3390b7c9fdbb818507/spec/v2-consumers.json#L30059-L30180 (fixed schema minimum/maximum is 5..10 while the field description narrows duration to 5 or 10; conservative intersection verified 2026-08-09)"];
function civitaiGenerationParameters(serviceId, fields, options = {}, evidence = CIVITAI_VIDEO_EVIDENCE) {
	return makeVideoGenerationParameterContract(`civitai:${serviceId}`, evidence, "unsupported", fields, options);
}
var CIVITAI_INT32_SEED = supportedParameter("integer", "seed", "live schema 接受 nullable int32 seed", { integer: true });
var CIVITAI_INT64_SEED = supportedParameter("integer", "seed", "live schema 接受 nullable int64 seed；JavaScript 调用方仍须使用安全整数", { integer: true });
var CIVITAI_WAN_GUIDANCE = supportedParameter("number", "cfgScale", "live Wan schema 范围 0..100", {
	minimum: 0,
	maximum: 100,
	defaultValue: 4,
	required: true
});
var CIVITAI_WAN_FPS = supportedParameter("integer", "frameRate", "live Wan schema 接受 int32，未公布最小值或最大值", {
	integer: true,
	defaultValue: 24
});
var CIVITAI_WAN_DURATION = supportedParameter("integer", "duration", "live Wan 基础 schema 范围 1..30", {
	minimum: 1,
	maximum: 30,
	integer: true,
	defaultValue: 5
});
var CIVITAI_WAN_STEPS = supportedParameter("integer", "steps", "live Wan 基础 schema 范围 10..50", {
	minimum: 10,
	maximum: 50,
	integer: true,
	defaultValue: 20
});
var CIVITAI_WAN_NEGATIVE = supportedParameter("string", "negativePrompt", "live operation schema 接受 nullable negativePrompt");
function civitaiWanFields(options) {
	return {
		duration: CIVITAI_WAN_DURATION,
		fps: CIVITAI_WAN_FPS,
		...options.resolution ? { resolution: supportedParameter("string", "resolution", "live service 分辨率枚举", { enumValues: options.resolution }) } : {},
		...options.aspectRatios ? { aspectRatio: supportedParameter("string", "aspectRatio", "live service 画面比例枚举", { enumValues: options.aspectRatios }) } : {},
		...options.audio ? { audio: options.audio } : {},
		...options.negativePrompt ? { negativePrompt: CIVITAI_WAN_NEGATIVE } : {},
		seed: CIVITAI_INT32_SEED,
		steps: CIVITAI_WAN_STEPS,
		guidance: CIVITAI_WAN_GUIDANCE,
		...options.promptExpansion ? { promptExpansion: supportedParameter("boolean", "enablePromptExpansion", "是否启用提示词扩写") } : {},
		...options.safetyChecker ? { safetyChecker: supportedParameter("boolean", "enableSafetyChecker", "live schema 的 provider 安全检查开关") } : {},
		...options.shift ? { shift: supportedParameter("number", "shift", "live schema 范围 1..10", {
			minimum: 1,
			maximum: 10,
			defaultValue: 5
		}) } : {},
		...options.turbo ? { turbo: supportedParameter("boolean", "useTurbo", "live schema 的 Wan turbo 开关") } : {}
	};
}
function civitaiHappyHorseParameters(serviceId, kind) {
	return civitaiGenerationParameters(serviceId, {
		duration: supportedParameter("integer", "duration", "live v1.1 schema 范围 3..15", {
			minimum: 3,
			maximum: 15,
			integer: true,
			defaultValue: 5
		}),
		resolution: supportedParameter("string", "resolution", "Civitai HappyHorse v1.1 live 枚举", {
			enumValues: ["720p", "1080p"],
			defaultValue: "1080p"
		}),
		...kind === "i2v" ? {} : { aspectRatio: supportedParameter("string", "aspectRatio", "Civitai HappyHorse v1.1 live 枚举", {
			enumValues: HAPPYHORSE_VIDEO_RATIOS,
			defaultValue: "16:9"
		}) },
		seed: CIVITAI_INT64_SEED
	});
}
var CIVITAI_HUNYUAN_PARAMETERS = civitaiGenerationParameters("video/hunyuan", {
	duration: supportedParameter("integer", "duration", "live schema 范围 1..30", {
		minimum: 1,
		maximum: 30,
		integer: true,
		defaultValue: 5
	}),
	fps: supportedParameter("integer", "frameRate", "live schema 接受 int32，未公布范围", {
		integer: true,
		defaultValue: 25
	}),
	dimensions: supportedParameter("dimensions", "width/height", "width 和 height 为必填 int32；live schema 未公布数值范围", {
		integer: true,
		required: true,
		defaultValue: "1280x720"
	}),
	seed: CIVITAI_INT32_SEED,
	steps: supportedParameter("integer", "steps", "live schema 范围 10..50", {
		minimum: 10,
		maximum: 50,
		integer: true,
		defaultValue: 20
	}),
	guidance: supportedParameter("number", "cfgScale", "live schema 范围 0..100", {
		minimum: 0,
		maximum: 100,
		defaultValue: 4,
		required: true
	})
});
var CIVITAI_KLING_PARAMETERS = civitaiGenerationParameters("video/kling", {
	duration: supportedParameter("string", "duration", "live Kling schema 使用字符串枚举", {
		enumValues: ["5", "10"],
		defaultValue: "5"
	}),
	aspectRatio: supportedParameter("string", "aspectRatio", "live Kling 比例枚举", { enumValues: [
		"16:9",
		"9:16",
		"1:1"
	] }),
	negativePrompt: supportedParameter("string", "negativePrompt", "live schema 接受 nullable negativePrompt"),
	guidance: supportedParameter("number", "cfgScale", "live schema 范围 0..1", {
		minimum: 0,
		maximum: 1,
		defaultValue: .5,
		required: true
	}),
	modelVariant: supportedParameter("string", "model", "live Kling 模型枚举", { enumValues: [
		"v1",
		"v1.5",
		"v1.6",
		"v2",
		"v2.5-turbo"
	] }),
	mode: supportedParameter("string", "mode", "live Kling 质量模式", { enumValues: ["standard", "professional"] })
});
var CIVITAI_KLING_V3_PARAMETERS = civitaiGenerationParameters("video/kling-v3", {
	duration: supportedParameter("integer", "duration", "live Kling V3 schema 范围 3..15", {
		minimum: 3,
		maximum: 15,
		integer: true,
		defaultValue: 5
	}),
	aspectRatio: supportedParameter("string", "aspectRatio", "live Kling V3 比例枚举", { enumValues: [
		"16:9",
		"9:16",
		"1:1"
	] }),
	audio: supportedParameter("boolean", "generateAudio", "是否生成音频", { defaultValue: false }),
	mode: supportedParameter("string", "mode", "live Kling V3 质量模式", { enumValues: ["standard", "professional"] })
});
function civitaiLtx23Parameters(serviceId, firstLast) {
	return civitaiGenerationParameters(serviceId, {
		duration: unavailableParameter("conflict", "live schema enum 为 3|20，但 description 写 3|5、default 为 5；冲突解除前拒绝非空 duration"),
		fps: supportedParameter("number", "fps", "live schema 范围 1..60", {
			minimum: 1,
			maximum: 60,
			defaultValue: 24
		}),
		dimensions: supportedParameter("dimensions", "width/height", "width 和 height 为 int32；live schema 未公布范围", {
			integer: true,
			defaultValue: "1280x720"
		}),
		audio: supportedParameter("boolean", "generateAudio", "是否生成音频", { defaultValue: true }),
		negativePrompt: supportedParameter("string", "negativePrompt", "live schema 接受 nullable negativePrompt"),
		seed: CIVITAI_INT32_SEED,
		steps: supportedParameter("integer", "steps", "live schema 范围 8..50", {
			minimum: 8,
			maximum: 50,
			integer: true,
			defaultValue: 20
		}),
		guidance: supportedParameter("number", "guidanceScale", "live schema 范围 1..10", {
			minimum: 1,
			maximum: 10,
			defaultValue: 4
		}),
		quantity: supportedParameter("integer", "quantity", "单作业生成数量 1..10", {
			minimum: 1,
			maximum: 10,
			integer: true,
			defaultValue: 1
		}),
		modelVariant: supportedParameter("string", "model", "LTX 2.3 live 模型枚举", {
			enumValues: ["22b-dev", "22b-distilled"],
			defaultValue: "22b-dev"
		}),
		...firstLast ? { frameGuideStrength: supportedParameter("number", "frameGuideStrength", "首尾帧引导强度 0..1", {
			minimum: 0,
			maximum: 1,
			defaultValue: .7
		}) } : {}
	});
}
var CIVITAI_MINIMAX_H3_PARAMETERS = civitaiGenerationParameters("video/minimax-h3", {
	duration: supportedParameter("integer", "duration", "live schema 范围 5..15", {
		minimum: 5,
		maximum: 15,
		integer: true,
		required: true,
		defaultValue: 5
	}),
	resolution: supportedParameter("string", "resolution", "live schema 当前只允许 2K", {
		enumValues: ["2K"],
		required: true,
		defaultValue: "2K"
	}),
	aspectRatio: supportedParameter("string", "aspectRatio", "live MiniMax H3 比例枚举", {
		enumValues: [
			"adaptive",
			"21:9",
			"16:9",
			"4:3",
			"1:1",
			"3:4",
			"9:16"
		],
		required: true,
		defaultValue: "16:9"
	}),
	watermark: supportedParameter("boolean", "watermark", "是否添加水印", { defaultValue: false })
});
var CIVITAI_SEEDANCE_PARAMETERS = civitaiGenerationParameters("video/seedance", {
	duration: supportedParameter("integer", "duration", "live schema 精确整数枚举 4..15", {
		enumValues: [
			4,
			5,
			6,
			7,
			8,
			9,
			10,
			11,
			12,
			13,
			14,
			15
		],
		integer: true,
		required: true,
		defaultValue: 5
	}),
	resolution: supportedParameter("string", "resolution", "live Seedance 分辨率枚举", {
		enumValues: [
			"480p",
			"720p",
			"1080p"
		],
		required: true,
		defaultValue: "720p"
	}),
	aspectRatio: supportedParameter("string", "aspectRatio", "live Seedance 比例枚举", {
		enumValues: [
			"16:9",
			"9:16",
			"1:1",
			"4:3",
			"3:4",
			"21:9",
			"adaptive"
		],
		required: true,
		defaultValue: "16:9"
	}),
	audio: supportedParameter("boolean", "generateAudio", "是否生成音频", { defaultValue: true }),
	seed: CIVITAI_INT64_SEED,
	modelVariant: supportedParameter("string", "model", "live Seedance 模型枚举", { enumValues: [
		"v2",
		"v2-fast",
		"v2-mini",
		"v2.5"
	] })
});
function civitaiSoraParameters(serviceId) {
	return civitaiGenerationParameters(serviceId, {
		duration: supportedParameter("integer", "duration", "Civitai Sora live schema 范围 4..12；这不是 OpenAI 原生 seconds 枚举", {
			minimum: 4,
			maximum: 12,
			integer: true,
			defaultValue: 4
		}),
		resolution: supportedParameter("string", "resolution", "live schema 分辨率枚举", {
			enumValues: ["720p", "1080p"],
			defaultValue: "720p"
		}),
		aspectRatio: supportedParameter("string", "aspectRatio", "live schema 比例枚举", {
			enumValues: [
				"auto",
				"16:9",
				"9:16"
			],
			defaultValue: "auto"
		}),
		seed: CIVITAI_INT32_SEED,
		usePro: supportedParameter("boolean", "usePro", "是否使用 Sora Pro provider 路径", { defaultValue: false })
	});
}
function civitaiGrokParameters(serviceId, imageToVideo) {
	return civitaiGenerationParameters(serviceId, {
		duration: supportedParameter("integer", "duration", "live Grok schema 范围 1..15", {
			minimum: 1,
			maximum: 15,
			integer: true,
			defaultValue: 6
		}),
		resolution: supportedParameter("string", "resolution", "live Grok 分辨率枚举", {
			enumValues: ["480p", "720p"],
			defaultValue: "720p"
		}),
		...imageToVideo ? { aspectRatio: supportedParameter("string", "aspectRatio", "Grok I2V live 比例枚举", {
			enumValues: [
				"auto",
				"16:9",
				"4:3",
				"3:2",
				"1:1",
				"2:3",
				"3:4",
				"9:16"
			],
			defaultValue: "auto"
		}) } : {}
	});
}
var CIVITAI_VIDU_PARAMETERS = civitaiGenerationParameters("video/vidu", {
	duration: supportedParameter("integer", "duration", "live Vidu 精确枚举", {
		enumValues: [4, 8],
		integer: true,
		defaultValue: 4
	}),
	aspectRatio: supportedParameter("string", "aspectRatio", "live Vidu 比例枚举", { enumValues: [
		"16:9",
		"9:16",
		"1:1"
	] }),
	audio: supportedParameter("boolean", "enableBackgroundMusic", "是否生成背景音乐", { defaultValue: false }),
	seed: CIVITAI_INT32_SEED,
	modelVariant: supportedParameter("string", "model", "live Vidu 模型枚举", { enumValues: [
		"default",
		"q1",
		"q3"
	] }),
	mode: supportedParameter("string", "movementAmplitude", "运动幅度枚举", { enumValues: [
		"auto",
		"small",
		"medium",
		"large"
	] })
});
var CIVITAI_VIDU_Q3_PARAMETERS = civitaiGenerationParameters("video/vidu-q3", {
	duration: supportedParameter("integer", "duration", "live Vidu Q3 范围 1..16", {
		minimum: 1,
		maximum: 16,
		integer: true,
		defaultValue: 5
	}),
	resolution: supportedParameter("string", "resolution", "live Vidu Q3 分辨率枚举", {
		enumValues: [
			"360p",
			"540p",
			"720p",
			"1080p"
		],
		defaultValue: "720p"
	}),
	aspectRatio: supportedParameter("string", "aspectRatio", "live Vidu Q3 比例枚举", { enumValues: [
		"16:9",
		"9:16",
		"1:1",
		"4:3",
		"3:4"
	] }),
	audio: supportedParameter("boolean", "enableAudio", "是否生成音频", { defaultValue: true }),
	seed: CIVITAI_INT32_SEED,
	turbo: supportedParameter("boolean", "turbo", "是否启用 turbo", { defaultValue: false })
});
var CIVITAI_WAN21_PARAMETERS = civitaiGenerationParameters("video/wan/v2.1/civitai", {
	...civitaiWanFields({}),
	dimensions: supportedParameter("dimensions", "width/height", "live schema 接受 int32 width/height，未公布范围", {
		integer: true,
		defaultValue: "480x480"
	})
});
var CIVITAI_WAN225B_I2V_PARAMETERS = civitaiGenerationParameters("video/wan/v2.2-5b/fal/image-to-video", { ...civitaiWanFields({
	resolution: [
		"480p",
		"580p",
		"720p"
	],
	aspectRatios: [
		"1:1",
		"16:9",
		"9:16",
		"auto"
	],
	negativePrompt: true,
	promptExpansion: true,
	safetyChecker: true
}) });
var CIVITAI_WAN22_I2V_PARAMETERS = civitaiGenerationParameters("video/wan/v2.2/fal/image-to-video", { ...civitaiWanFields({
	resolution: ["480p", "720p"],
	aspectRatios: [
		"1:1",
		"16:9",
		"9:16",
		"4:3",
		"3:4",
		"4:5",
		"5:4"
	],
	negativePrompt: true,
	promptExpansion: true,
	safetyChecker: true,
	shift: true,
	turbo: true
}) });
var CIVITAI_WAN25_I2V_PARAMETERS = civitaiGenerationParameters("video/wan/v2.5/fal/image-to-video", { ...civitaiWanFields({
	resolution: [
		"480p",
		"720p",
		"1080p"
	],
	aspectRatios: [
		"16:9",
		"9:16",
		"1:1"
	],
	negativePrompt: true,
	promptExpansion: true
}) });
var CIVITAI_WAN27_I2V_PARAMETERS = civitaiGenerationParameters("video/wan/v2.7/fal/image-to-video", {
	...civitaiWanFields({
		resolution: ["720p", "1080p"],
		negativePrompt: true,
		promptExpansion: true,
		safetyChecker: true,
		audio: supportedParameter("string", "audioUrl", "live I2V schema 接受 WAV/MP3 音频 URL")
	}),
	aspectRatio: unavailableParameter("unsupported", "Civitai Wan 2.7 I2V live schema 没有 aspectRatio；输出比例由输入帧决定")
});
var CIVITAI_WAN26_R2V_PARAMETERS = civitaiGenerationParameters("video/wan/v2.6/fal/reference-to-video", {
	duration: supportedParameter("integer", "duration", "fixed schema 数值范围为 5..10，但同字段 description/官方指南仅允许 5 或 10；采用保守交集", {
		enumValues: [5, 10],
		integer: true,
		defaultValue: 5
	}),
	resolution: supportedParameter("string", "resolution", "fixed schema 分辨率枚举", {
		enumValues: ["720p", "1080p"],
		defaultValue: "1080p"
	}),
	aspectRatio: supportedParameter("string", "aspectRatio", "fixed schema 画面比例枚举", {
		enumValues: [
			"16:9",
			"9:16",
			"1:1",
			"4:3",
			"3:4"
		],
		defaultValue: "16:9"
	}),
	guidance: CIVITAI_WAN_GUIDANCE
}, {}, CIVITAI_WAN26_R2V_EVIDENCE);
var CIVITAI_WAN27_R2V_PARAMETERS = civitaiGenerationParameters("video/wan/v2.7/fal/reference-to-video", { ...civitaiWanFields({
	resolution: ["720p", "1080p"],
	aspectRatios: DASHSCOPE_VIDEO_RATIOS,
	negativePrompt: true,
	safetyChecker: true
}) });
var CIVITAI_VIDEO_GENERATION_PARAMETER_CONTRACTS = {
	"video/grok/image-to-video": civitaiGrokParameters("video/grok/image-to-video", true),
	"video/grok/text-to-video": civitaiGrokParameters("video/grok/text-to-video", false),
	"video/happyhorse/v1.1/imagetovideo": civitaiHappyHorseParameters("video/happyHorse/v1.1/imageToVideo", "i2v"),
	"video/happyhorse/v1.1/referencetovideo": civitaiHappyHorseParameters("video/happyHorse/v1.1/referenceToVideo", "r2v"),
	"video/happyhorse/v1.1/texttovideo": civitaiHappyHorseParameters("video/happyHorse/v1.1/textToVideo", "t2v"),
	"video/hunyuan": CIVITAI_HUNYUAN_PARAMETERS,
	"video/kling": CIVITAI_KLING_PARAMETERS,
	"video/kling-v3": CIVITAI_KLING_V3_PARAMETERS,
	"kling-v3": CIVITAI_KLING_V3_PARAMETERS,
	"video/ltx2.3/createvideo": civitaiLtx23Parameters("video/ltx2.3/createVideo", false),
	"video/ltx2.3/firstlastframetovideo": civitaiLtx23Parameters("video/ltx2.3/firstLastFrameToVideo", true),
	"video/minimax-h3": CIVITAI_MINIMAX_H3_PARAMETERS,
	"video/seedance": CIVITAI_SEEDANCE_PARAMETERS,
	"video/sora/image-to-video": civitaiSoraParameters("video/sora/image-to-video"),
	"video/sora/text-to-video": civitaiSoraParameters("video/sora/text-to-video"),
	"video/vidu": CIVITAI_VIDU_PARAMETERS,
	"video/vidu-q3": CIVITAI_VIDU_Q3_PARAMETERS,
	"video/wan/v2.1/civitai": CIVITAI_WAN21_PARAMETERS,
	"video/wan/v2.2-5b/fal/image-to-video": CIVITAI_WAN225B_I2V_PARAMETERS,
	"video/wan/v2.2/fal/image-to-video": CIVITAI_WAN22_I2V_PARAMETERS,
	"video/wan/v2.5/fal/image-to-video": CIVITAI_WAN25_I2V_PARAMETERS,
	"video/wan/v2.6/fal/reference-to-video": CIVITAI_WAN26_R2V_PARAMETERS,
	"video/wan/v2.7/fal/image-to-video": CIVITAI_WAN27_I2V_PARAMETERS,
	"video/wan/v2.7/fal/reference-to-video": CIVITAI_WAN27_R2V_PARAMETERS
};
Object.freeze(Object.keys(CIVITAI_VIDEO_GENERATION_PARAMETER_CONTRACTS));
makeVideoGenerationParameterContract("unknown:video-generation-parameters", ["No exact provider + model/service generation schema matched"], "unpublished", {});
function isVideoCapabilityProfileId(value) {
	return typeof value === "string" && value in VIDEO_CAPABILITY_PROFILES;
}
function normalizeVideoCapabilityProfiles(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
	const normalized = {};
	for (const [rawModel, profile] of Object.entries(value)) {
		const model = String(rawModel || "").trim();
		if (model && isVideoCapabilityProfileId(profile)) normalized[model] = profile;
	}
	return Object.keys(normalized).length ? normalized : void 0;
}
function normalizeModelsDevMetadataRecord(value, allowedModelIds) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
	const allowed = allowedModelIds ? new Set(allowedModelIds.map((model) => String(model || "").trim()).filter(Boolean)) : void 0;
	const result = {};
	for (const [rawModelId, rawMetadata] of Object.entries(value)) {
		const modelId = rawModelId.trim();
		if (!modelId || allowed && !allowed.has(modelId)) continue;
		const metadata = sanitizePersistedMetadata(rawMetadata);
		if (metadata) result[modelId] = metadata;
	}
	return Object.keys(result).length ? result : void 0;
}
function sanitizePersistedMetadata(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
	const record = value;
	if (record.source !== "models.dev" || record.matchedBy !== "exact" && record.matchedBy !== "normalized") return void 0;
	const catalogId = stringOrUndefined(record.catalogId);
	if (!catalogId) return void 0;
	const reasoningOptions = sanitizeReasoningOptions(record.reasoningOptions);
	const status = stringOrUndefined(record.status);
	const lastUpdated = stringOrUndefined(record.lastUpdated);
	return {
		source: "models.dev",
		matchedBy: record.matchedBy,
		catalogId,
		outputModalities: normalizeStringArray(record.outputModalities),
		...typeof record.reasoning === "boolean" ? { reasoning: record.reasoning } : {},
		...reasoningOptions.length ? { reasoningOptions } : {},
		...status ? { status } : {},
		...lastUpdated ? { lastUpdated } : {}
	};
}
function sanitizeReasoningOptions(value) {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		if (!item || typeof item !== "object" || Array.isArray(item)) return [];
		const record = item;
		const type = stringOrUndefined(record.type);
		if (!type) return [];
		const values = normalizeStringArray(record.values);
		const min = finiteNumberOrUndefined(record.min);
		const max = finiteNumberOrUndefined(record.max);
		return [{
			type,
			...values.length ? { values } : {},
			...min !== void 0 ? { min } : {},
			...max !== void 0 ? { max } : {}
		}];
	});
}
function normalizeStringArray(value) {
	if (!Array.isArray(value)) return [];
	return Array.from(new Set(value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)));
}
function stringOrUndefined(value) {
	return (typeof value === "string" ? value.trim() : "") || void 0;
}
function finiteNumberOrUndefined(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function isCivitaiAdapterType(value) {
	return String(value || "").trim().toLowerCase() === "civitai-orchestration";
}
function civitaiAllowsMatureContent(provider) {
	if (!isCivitaiAdapterType(provider?.adapterType)) return provider?.allowMatureContent === true;
	return provider?.allowMatureContent !== false;
}
function createProviderCredentialId() {
	const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
	return randomUUID ? `credential-${randomUUID()}` : `credential-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function reconcileProviderCredentialIds(keys, previousKeys = [], previousIds = []) {
	const previousByKey = /* @__PURE__ */ new Map();
	previousKeys.forEach((key, index) => {
		const normalizedKey = normalizeProviderKeyInput(key);
		const id = String(previousIds[index] || "").trim();
		if (normalizedKey && id && !previousByKey.has(normalizedKey)) previousByKey.set(normalizedKey, id);
	});
	return deduplicateKeys(keys).map((key) => previousByKey.get(key) || createProviderCredentialId());
}
function normalizeProviderKeyInput(value) {
	const input = String(value || "").trim();
	if (!input) return "";
	if (/^bearer\s+/i.test(input)) return input.replace(/^bearer\s+/i, "").trim();
	if (input.startsWith("{") && input.endsWith("}")) try {
		const parsed = JSON.parse(input);
		if (isRecord(parsed)) {
			const key = parsed.OPENAI_API_KEY || parsed.apiKey || parsed.api_key || parsed.key;
			if (typeof key === "string" && key.trim()) return normalizeProviderKeyInput(key);
		}
	} catch {
		return input;
	}
	return input;
}
function normalizeProviderCredentials(apiKey, apiKeys) {
	const normalizedApiKey = normalizeProviderKeyInput(apiKey);
	const normalizedPool = deduplicateKeys(apiKeys || []);
	return {
		apiKey: normalizedApiKey,
		...normalizedPool.length ? { apiKeys: normalizedPool } : {}
	};
}
function deduplicateKeys(values) {
	return [...new Set(values.map((value) => normalizeProviderKeyInput(value)).filter(Boolean))];
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
var API_CAPABILITIES = [
	"text",
	"image",
	"video",
	"audio"
];
var defaultApiRelayAdvanced = {
	allowCustomModel: false,
	defaultTimeoutMs: 36e4,
	showDisabledProviders: false
};
var MIN_RELAY_TIMEOUT_MS = 3e4;
var MAX_RELAY_TIMEOUT_MS = 9e5;
function normalizeRelayTimeoutMs(value, fallback = defaultApiRelayAdvanced.defaultTimeoutMs) {
	const numeric = Math.floor(Number(value));
	const fallbackNumeric = Math.floor(Number(fallback));
	const safeValue = Number.isFinite(numeric) && numeric > 0 ? numeric : Number.isFinite(fallbackNumeric) && fallbackNumeric > 0 ? fallbackNumeric : defaultApiRelayAdvanced.defaultTimeoutMs;
	return Math.max(MIN_RELAY_TIMEOUT_MS, Math.min(MAX_RELAY_TIMEOUT_MS, safeValue));
}
function createApiRelayProvider(input = {}) {
	const now = input.createdAt || (/* @__PURE__ */ new Date()).toISOString();
	const allModels = normalizeModelList(input.models || [
		...input.textModels || [],
		...input.imageModels || [],
		...input.videoModels || [],
		...input.audioModels || []
	]);
	const credentials = normalizeProviderCredentials(input.apiKey || "", input.apiKeys);
	const apiKeyIds = credentials.apiKeys ? reconcileProviderCredentialIds(credentials.apiKeys, input.apiKeys, input.apiKeyIds) : void 0;
	return normalizeApiRelayProvider({
		id: input.id || `relay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		name: input.name || "中转 API",
		baseUrl: input.baseUrl || "",
		apiKey: credentials.apiKey,
		...credentials.apiKey ? { apiKeyId: input.apiKeyId?.trim() || createProviderCredentialId() } : {},
		...credentials.apiKeys ? { apiKeys: [...credentials.apiKeys] } : {},
		...apiKeyIds ? { apiKeyIds } : {},
		...input.adapterType ? { adapterType: input.adapterType } : {},
		proxyMode: input.proxyMode === "custom" ? "custom" : "direct",
		proxyUrl: String(input.proxyUrl || "").trim(),
		...input.videoCapabilityProfiles ? { videoCapabilityProfiles: normalizeVideoCapabilityProfiles(input.videoCapabilityProfiles) } : {},
		...input.audioCapabilityProfiles ? { audioCapabilityProfiles: normalizeAudioCapabilityProfiles(input.audioCapabilityProfiles) } : {},
		...input.imageCapabilityProfiles ? { imageCapabilityProfiles: normalizeImageCapabilityProfiles(input.imageCapabilityProfiles) } : {},
		...input.modelCatalogMetadata ? { modelCatalogMetadata: normalizeModelsDevMetadataRecord(input.modelCatalogMetadata, allModels) } : {},
		allowMatureContent: civitaiAllowsMatureContent({
			adapterType: input.adapterType,
			allowMatureContent: input.allowMatureContent
		}),
		...isCivitaiAdapterType(input.adapterType) ? { civitaiMaturePolicyVersion: 1 } : {},
		...input.timeoutOverrideMs !== void 0 ? { timeoutOverrideMs: input.timeoutOverrideMs } : {},
		enabled: input.enabled === true,
		capabilities: normalizeCapabilities(input.capabilities || inferCapabilitiesFromModels(allModels)),
		models: allModels,
		textModels: input.textModels || filterModelsByCapability(allModels, "text"),
		imageModels: input.imageModels || filterModelsByCapability(allModels, "image"),
		videoModels: input.videoModels || filterModelsByCapability(allModels, "video"),
		audioModels: input.audioModels || filterModelsByCapability(allModels, "audio"),
		timeoutMs: input.timeoutMs || defaultApiRelayAdvanced.defaultTimeoutMs,
		remark: input.remark || "",
		createdAt: now,
		updatedAt: input.updatedAt || now
	});
}
function resolvePersistedCivitaiMatureContent(provider) {
	if (!isCivitaiAdapterType(provider.adapterType)) return provider.allowMatureContent === true;
	const persistedVersion = Number(provider.civitaiMaturePolicyVersion);
	if (Number.isFinite(persistedVersion) && persistedVersion >= 1) return provider.allowMatureContent !== false;
	return true;
}
function normalizeApiRelayProvider(provider) {
	provider = provider && typeof provider === "object" ? provider : {};
	const persistedStringList = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
	const persistedModels = persistedStringList(provider.models);
	const persistedTextModels = persistedStringList(provider.textModels);
	const persistedImageModels = persistedStringList(provider.imageModels);
	const persistedVideoModels = persistedStringList(provider.videoModels);
	const persistedAudioModels = persistedStringList(provider.audioModels);
	const models = Array.isArray(provider.models) ? normalizeModelList(persistedModels) : mergeModelLists(persistedTextModels, persistedImageModels, persistedVideoModels, persistedAudioModels);
	const pickAssigned = (assigned, capability) => normalizeModelList(Array.isArray(assigned) ? persistedStringList(assigned) : filterModelsByCapability(models, capability));
	const legacyGrokTextModels = models.filter(isLegacyGrokTextModelName);
	const legacyHappyHorseVideoModels = models.filter(isHappyHorseVideoModelName);
	const textModels = mergeModelLists(pickAssigned(provider.textModels, "text"), legacyGrokTextModels).filter((model) => !legacyHappyHorseVideoModels.includes(model));
	const imageModels = pickAssigned(provider.imageModels, "image");
	const videoModels = mergeModelLists(pickAssigned(provider.videoModels, "video").filter((model) => !legacyGrokTextModels.includes(model)), legacyHappyHorseVideoModels);
	const audioModels = pickAssigned(provider.audioModels, "audio");
	const persistedCapabilities = Array.isArray(provider.capabilities) ? provider.capabilities : [];
	const persistedApiKeys = Array.isArray(provider.apiKeys) ? provider.apiKeys : void 0;
	const persistedApiKeyIds = Array.isArray(provider.apiKeyIds) ? provider.apiKeyIds : void 0;
	const providerName = typeof provider.name === "string" ? provider.name.trim() : "";
	const providerBaseUrl = typeof provider.baseUrl === "string" ? provider.baseUrl.trim() : "";
	const providerApiKeyId = typeof provider.apiKeyId === "string" ? provider.apiKeyId.trim() : "";
	const providerRemark = typeof provider.remark === "string" ? provider.remark : "";
	const legacyTimeoutMs = Number(provider.timeoutMs);
	const timeoutOverrideMs = provider.timeoutOverrideMs !== void 0 ? normalizeRelayTimeoutMs(provider.timeoutOverrideMs) : Number.isFinite(legacyTimeoutMs) && legacyTimeoutMs > 0 && legacyTimeoutMs !== defaultApiRelayAdvanced.defaultTimeoutMs ? normalizeRelayTimeoutMs(legacyTimeoutMs) : void 0;
	const credentials = normalizeProviderCredentials(typeof provider.apiKey === "string" ? provider.apiKey : "", persistedApiKeys);
	const apiKeyIds = credentials.apiKeys ? reconcileProviderCredentialIds(credentials.apiKeys, persistedApiKeys, persistedApiKeyIds) : void 0;
	return {
		...provider,
		name: providerName || "中转 API",
		baseUrl: providerBaseUrl,
		apiKey: credentials.apiKey,
		apiKeyId: credentials.apiKey ? providerApiKeyId || createProviderCredentialId() : void 0,
		apiKeys: credentials.apiKeys ? [...credentials.apiKeys] : void 0,
		apiKeyIds,
		proxyMode: provider.proxyMode === "custom" ? "custom" : "direct",
		proxyUrl: String(provider.proxyUrl || "").trim(),
		videoCapabilityProfiles: normalizeVideoCapabilityProfiles(provider.videoCapabilityProfiles),
		audioCapabilityProfiles: normalizeAudioCapabilityProfiles(provider.audioCapabilityProfiles),
		imageCapabilityProfiles: normalizeImageCapabilityProfiles(provider.imageCapabilityProfiles),
		modelCatalogMetadata: normalizeModelsDevMetadataRecord(provider.modelCatalogMetadata, models),
		allowMatureContent: resolvePersistedCivitaiMatureContent(provider),
		...isCivitaiAdapterType(provider.adapterType) ? { civitaiMaturePolicyVersion: 1 } : {},
		enabled: provider.enabled !== false,
		capabilities: normalizeCapabilities([
			...persistedCapabilities,
			...textModels.length ? ["text"] : [],
			...imageModels.length ? ["image"] : [],
			...videoModels.length ? ["video"] : [],
			...audioModels.length ? ["audio"] : [],
			...legacyHappyHorseVideoModels.length ? ["video"] : []
		]),
		models,
		textModels,
		imageModels,
		videoModels,
		audioModels,
		...timeoutOverrideMs !== void 0 ? { timeoutOverrideMs } : {},
		timeoutMs: normalizeRelayTimeoutMs(timeoutOverrideMs ?? provider.timeoutMs),
		remark: providerRemark
	};
}
var DISPLAY_TOKEN_START = "(?:^|[^a-z\\d])";
var DISPLAY_TOKEN_END = "(?=$|[^a-z\\d])";
new RegExp(`${DISPLAY_TOKEN_START}sk-(?:[a-z\\d]+-)*[a-z\\d_-]{20,}${DISPLAY_TOKEN_END}`, "iu"), new RegExp(`${DISPLAY_TOKEN_START}(?:gh[pousr]_[a-z\\d]{20,}|github_pat_[a-z\\d_]{20,})${DISPLAY_TOKEN_END}`, "iu"), new RegExp(`${DISPLAY_TOKEN_START}glpat-[a-z\\d_-]{16,}${DISPLAY_TOKEN_END}`, "iu"), new RegExp(`${DISPLAY_TOKEN_START}xox[baprs]-[a-z\\d-]{16,}${DISPLAY_TOKEN_END}`, "iu"), new RegExp(`${DISPLAY_TOKEN_START}AIza[a-z\\d_-]{20,}${DISPLAY_TOKEN_END}`, "iu"), new RegExp(`${DISPLAY_TOKEN_START}(?:AKIA|ASIA)[A-Z\\d]{16}${DISPLAY_TOKEN_END}`, "u"), new RegExp(`${DISPLAY_TOKEN_START}eyJ[a-z\\d_-]{7,}\\.[a-z\\d_-]{10,}\\.[a-z\\d_-]{10,}${DISPLAY_TOKEN_END}`, "iu");
new RegExp(`${DISPLAY_TOKEN_START}bearer\\s+\\S+`, "iu");
new RegExp(`${DISPLAY_TOKEN_START}(?:data|blob|file|image|video|audio|storage):[^\\s<>"']+`, "iu");
new RegExp(`${DISPLAY_TOKEN_START}(?:[a-z][a-z\\d+.-]*:\\/\\/|www\\.)[^\\s<>"']+`, "iu");
new RegExp(`${DISPLAY_TOKEN_START}(?:localhost|\\d{1,3}(?:\\.\\d{1,3}){3}|\\[[\\da-f:]+\\]|(?:[\\p{L}\\d-]+\\.)+[\\p{L}]{2,})(?::\\d+)?(?:[/?#][^\\s<>"']*)?(?=$|[^\\p{L}\\d.-])`, "iu");
function modelMatchesCapability(model, capability) {
	if (!capability) return true;
	if (capability === "image") return isImageModelName(model);
	if (capability === "video") return isVideoModelName(model);
	if (capability === "audio") return isAudioModelName(model);
	return isTextModelName(model);
}
function filterModelsByCapability(models, capability) {
	return capability ? normalizeModelList(models).filter((model) => modelMatchesCapability(model, capability)) : normalizeModelList(models);
}
function inferCapabilityFromModel(model) {
	if (isImageModelName(model)) return "image";
	if (isVideoModelName(model)) return "video";
	if (isAudioModelName(model)) return "audio";
	return "text";
}
function normalizeModelList(models) {
	return Array.from(new Set((models || []).map((model) => String(model || "").trim()).filter(Boolean)));
}
function mergeModelLists(...lists) {
	return normalizeModelList(lists.flat());
}
function inferCapabilitiesFromModels(models) {
	const inferred = /* @__PURE__ */ new Set();
	for (const model of models) inferred.add(inferCapabilityFromModel(model));
	return inferred.size ? API_CAPABILITIES.filter((capability) => inferred.has(capability)) : ["text"];
}
function normalizeCapabilities(capabilities) {
	const values = new Set(capabilities.filter((capability) => API_CAPABILITIES.includes(capability)));
	return API_CAPABILITIES.filter((capability) => values.has(capability));
}
function isVideoModelName(model) {
	const value = model.toLowerCase();
	return value.includes("seedance") || value.includes("video") || value.includes("sora") || value.includes("veo") || value.includes("kling") || value.includes("wan") || value.includes("hailuo") || value.includes("imagine") || isHappyHorseVideoModelName(value);
}
function isHappyHorseVideoModelName(model) {
	return model.trim().toLowerCase().includes("happyhorse");
}
function isLegacyGrokTextModelName(model) {
	const value = model.trim().toLowerCase();
	return value.startsWith("grok-") && !isVideoModelName(value) && !isImageModelName(value) && !isAudioModelName(value);
}
function isImageModelName(model) {
	const value = model.toLowerCase();
	return !isVideoModelName(model) && !isAudioModelName(model) && (value.includes("seedream") || value.includes("gpt-image") || value.includes("image") || value.includes("dall-e") || value.includes("dalle") || value.includes("imagen") || value.includes("flux") || value.includes("sdxl") || value.includes("stable-diffusion") || value.includes("midjourney"));
}
function isAudioModelName(model) {
	const value = model.toLowerCase();
	return value.includes("audio") || value.includes("tts") || value.includes("speech") || value.includes("voice") || value.includes("music") || value.includes("sound");
}
function isTextModelName(model) {
	if (isImageModelName(model) || isVideoModelName(model) || isAudioModelName(model)) return false;
	const value = model.trim().toLowerCase();
	return /(^|[/_.-])(gpt|chatgpt|claude|gemini|qwen|deepseek|llama|mistral|mixtral|command|grok|glm|kimi|minimax|doubao|ernie|yi|phi|o[134])([/_.-]|$)/u.test(value) || value.includes("chat") || value.includes("instruct") || value.includes("reasoning");
}
var relayKeyCursor = /* @__PURE__ */ new Map();
function rotateRelayApiKey(provider) {
	const keys = Array.from(new Set([provider.apiKey, ...provider.apiKeys || []].map((key) => String(key || "").trim()).filter(Boolean)));
	if (!keys.length) return "";
	if (keys.length === 1) return keys[0];
	const cursorKey = provider.id || provider.baseUrl;
	const index = relayKeyCursor.get(cursorKey) ?? 0;
	relayKeyCursor.set(cursorKey, (index + 1) % keys.length);
	return keys[index % keys.length];
}
async function studioProxyJson(input) {
	const path = input.path.startsWith("/") ? input.path : `/${input.path}`;
	const apiKey = rotateRelayApiKey(input.provider) || input.provider.apiKey;
	const controller = new AbortController();
	const timer = window.setTimeout(() => controller.abort(), input.timeoutMs || 12e4);
	const scheme = input.authScheme || "Bearer";
	try {
		const response = await fetch(`/local-relay-proxy${path}`, {
			method: input.method || "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: apiKey ? `${scheme} ${apiKey}` : "",
				"x-local-relay-base-url": input.baseUrl || input.provider.baseUrl,
				"Accept-Encoding": "identity",
				...input.extraHeaders || {}
			},
			body: input.method === "GET" || input.method === "DELETE" ? void 0 : JSON.stringify(input.body ?? {}),
			signal: controller.signal
		});
		const raw = await response.text();
		const jsonStart = raw.search(/[{[]/);
		const jsonText = jsonStart >= 0 ? raw.slice(jsonStart) : raw;
		let data = {};
		try {
			data = jsonText ? JSON.parse(jsonText) : {};
		} catch {
			throw new Error(response.ok ? `上游返回无法解析：${raw.slice(0, 160)}` : `请求失败 ${response.status}`);
		}
		if (!response.ok) {
			const err = data?.error;
			const message = (typeof err === "string" ? err : err?.message) || data?.message || `请求失败 ${response.status}`;
			throw new Error(message);
		}
		return data;
	} finally {
		window.clearTimeout(timer);
	}
}
function providerById(id, relays) {
	const found = relays.find((item) => item.id === id && (item.enabled || Boolean(item.apiKey)));
	if (!found) throw new Error(`没有启用的中转：${id}。到接线页填密钥并打开开关。`);
	return found;
}
function firstImageUrl(data) {
	if (!data || typeof data !== "object") return "";
	const record = data;
	const list = Array.isArray(record.data) ? record.data : Array.isArray(record.images) ? record.images : [];
	for (const item of list) {
		if (!item || typeof item !== "object") continue;
		const row = item;
		const url = String(row.url || row.image_url || "").trim();
		if (url) return url;
		const b64 = String(row.b64_json || row.b64 || "").trim();
		if (b64) return `data:image/png;base64,${b64}`;
	}
	return String(record.url || record.video_url || "").trim();
}
var CIVITAI_ENGINES = [
	{
		id: "krea2-turbo",
		label: "Krea 2 Turbo",
		kind: "image",
		nsfw: true,
		tags: ["mature", "Comfy"],
		body: (prompt, extra) => ({
			engine: "comfy",
			ecosystem: "krea2",
			model: "turbo",
			operation: "createImage",
			prompt,
			width: extra?.width || 1024,
			height: extra?.height || 1024,
			quantity: 1,
			...typeof extra?.seed === "number" ? { seed: extra.seed } : {},
			...extra?.negativePrompt ? { negativePrompt: extra.negativePrompt } : {},
			imageMetadata: JSON.stringify({
				app: "boundless-studio",
				engine: "krea2-turbo"
			}),
			...extra?.imageUrl ? { images: [extra.imageUrl] } : {}
		})
	},
	{
		id: "krea2-raw",
		label: "Krea 2 Raw",
		kind: "image",
		nsfw: true,
		tags: ["mature", "Comfy"],
		body: (prompt, extra) => ({
			engine: "comfy",
			ecosystem: "krea2",
			model: "raw",
			operation: "createImage",
			prompt,
			width: extra?.width || 1024,
			height: extra?.height || 1024,
			quantity: 1,
			imageMetadata: JSON.stringify({
				app: "boundless-studio",
				engine: "krea2-raw"
			}),
			...extra?.imageUrl ? { images: [extra.imageUrl] } : {}
		})
	},
	{
		id: "flux1",
		label: "Flux 1",
		kind: "image",
		nsfw: true,
		tags: ["mature", "Flux"],
		body: (prompt, extra) => ({
			engine: "comfy",
			ecosystem: "flux1",
			operation: "createImage",
			prompt,
			width: extra?.width || 1024,
			height: extra?.height || 1024,
			quantity: 1,
			...extra?.imageUrl ? { images: [extra.imageUrl] } : {}
		})
	},
	{
		id: "flux2-dev",
		label: "Flux 2 Dev",
		kind: "image",
		nsfw: true,
		tags: ["mature", "Flux"],
		body: (prompt, extra) => ({
			engine: "flux2",
			model: "dev",
			operation: "createImage",
			prompt,
			width: extra?.width || 1024,
			height: extra?.height || 1024,
			quantity: 1,
			...extra?.imageUrl ? { images: [extra.imageUrl] } : {}
		})
	},
	{
		id: "sdxl",
		label: "SDXL",
		kind: "image",
		nsfw: true,
		tags: ["mature", "SDXL"],
		body: (prompt, extra) => ({
			engine: "comfy",
			ecosystem: "sdxl",
			operation: "createImage",
			prompt,
			width: extra?.width || 1024,
			height: extra?.height || 1024,
			quantity: 1,
			...extra?.negativePrompt ? { negativePrompt: extra.negativePrompt } : {},
			...extra?.imageUrl ? { images: [extra.imageUrl] } : {}
		})
	},
	{
		id: "anima",
		label: "Anima",
		kind: "image",
		nsfw: true,
		tags: ["mature", "动漫"],
		body: (prompt, extra) => ({
			engine: "comfy",
			ecosystem: "anima",
			operation: "createImage",
			prompt,
			width: extra?.width || 1024,
			height: extra?.height || 1024,
			quantity: 1,
			...extra?.imageUrl ? { images: [extra.imageUrl] } : {}
		})
	},
	{
		id: "qwen-3.0-pro",
		label: "Qwen Image 3.0 Pro",
		kind: "image",
		nsfw: true,
		tags: ["mature", "Qwen"],
		body: (prompt, extra) => ({
			engine: "qwen",
			model: "3.0-pro",
			operation: extra?.imageUrl ? "editImage" : "createImage",
			prompt,
			...extra?.imageUrl ? { images: [extra.imageUrl] } : {}
		})
	},
	{
		id: "seedream-4.5",
		label: "Seedream 4.5",
		kind: "image",
		nsfw: true,
		tags: ["mature", "Seedream"],
		body: (prompt, extra) => ({
			engine: "seedream",
			version: "v4.5",
			prompt,
			enableSafetyChecker: false,
			quantity: 1,
			...extra?.width ? { width: extra.width } : {},
			...extra?.height ? { height: extra.height } : {},
			...extra?.imageUrl ? { images: [extra.imageUrl] } : {}
		})
	},
	{
		id: "seedream-5.0-pro",
		label: "Seedream 5.0 Pro",
		kind: "image",
		nsfw: true,
		tags: ["mature", "Seedream"],
		body: (prompt, extra) => ({
			engine: "seedream",
			version: "v5.0-pro",
			prompt,
			enableSafetyChecker: false,
			quantity: 1,
			...extra?.width ? { width: extra.width } : {},
			...extra?.height ? { height: extra.height } : {},
			...extra?.imageUrl ? { images: [extra.imageUrl] } : {}
		})
	},
	{
		id: "ltx2.3",
		label: "LTX 2.3",
		kind: "video",
		nsfw: true,
		tags: ["mature", "视频"],
		body: (prompt, extra) => ({
			engine: "ltx2.3",
			operation: extra?.imageUrl ? "firstLastFrameToVideo" : "createVideo",
			prompt,
			...extra?.imageUrl ? { images: [extra.imageUrl] } : {}
		})
	},
	{
		id: "hunyuan",
		label: "Hunyuan Video",
		kind: "video",
		nsfw: true,
		tags: ["mature", "视频"],
		body: (prompt) => ({
			engine: "hunyuan",
			prompt
		})
	}
];
function civitaiEngine(model) {
	return CIVITAI_ENGINES.find((item) => item.id === model) || CIVITAI_ENGINES[0];
}
function readCivitaiMediaUrl(data) {
	if (!data || typeof data !== "object") return "";
	const record = data;
	const media = [...record.images || [], ...record.videos || []];
	const ready = media.find((item) => item.url && item.available !== false) || media.find((item) => item.url);
	if (ready?.url) return String(ready.url).trim();
	const jobUrl = record.jobs?.[0]?.result?.blobUrl;
	return String(jobUrl || "").trim();
}
function readJobId(data) {
	if (!data || typeof data !== "object") return "";
	const record = data;
	return String(record.jobs?.[0]?.id || record.jobId || record.id || "").trim();
}
var civitaiAdapter = {
	id: "civitai",
	label: "Civitai Orchestration",
	docs: "https://developer.civitai.com/docs/api/orchestration",
	async generateImage(ctx, input) {
		if (!ctx.provider.apiKey) throw new Error("Civitai 需要 API Token");
		const engine = civitaiEngine(input.model);
		const url = readCivitaiMediaUrl(await studioProxyJson({
			provider: ctx.provider,
			path: "/imageGen?wait=1",
			body: engine.body(input.prompt, {
				imageUrl: input.imageUrl,
				width: input.width,
				height: input.height,
				seed: input.seed,
				negativePrompt: input.negativePrompt
			}),
			timeoutMs: 18e4
		}));
		if (!url) throw new Error("Civitai 没有返回图片地址");
		return { url };
	},
	async createVideo(ctx, input) {
		if (!ctx.provider.apiKey) throw new Error("Civitai 需要 API Token");
		const engine = civitaiEngine(input.model);
		const data = await studioProxyJson({
			provider: ctx.provider,
			path: "/videoGen?wait=0",
			body: engine.body(input.prompt, { imageUrl: input.imageUrl }),
			timeoutMs: 6e4
		});
		const id = readJobId(data);
		const url = readCivitaiMediaUrl(data);
		if (url) return { id: id || `done:${url}` };
		if (!id) throw new Error("Civitai 视频没有返回任务 id");
		return { id };
	},
	async pollVideo(ctx, taskId) {
		if (taskId.startsWith("done:")) return {
			status: "completed",
			url: taskId.slice(5)
		};
		const data = await studioProxyJson({
			provider: ctx.provider,
			path: `/jobs/${encodeURIComponent(taskId)}`,
			method: "GET",
			timeoutMs: 3e4,
			baseUrl: "https://orchestration.civitai.com/v2/consumer"
		});
		const url = readCivitaiMediaUrl(data);
		if (url) return {
			status: "completed",
			url
		};
		const record = data;
		const status = String(record.jobs?.[0]?.status || "").toLowerCase();
		if ([
			"failed",
			"error",
			"cancelled"
		].includes(status)) return {
			status: "failed",
			error: record.jobs?.[0]?.error || status
		};
		return { status: "pending" };
	},
	async testConnection(ctx) {
		if (!ctx.provider.apiKey) return {
			ok: false,
			message: "缺少 Civitai Token"
		};
		return {
			ok: true,
			message: "Token 已保存。生图走 POST /imageGen，视频走 /videoGen（mature 默认开）。"
		};
	}
};
var CIVITAI_IMAGE = CIVITAI_ENGINES.filter((item) => item.kind === "image").map((item) => item.id);
var CIVITAI_VIDEO = CIVITAI_ENGINES.filter((item) => item.kind === "video").map((item) => item.id);
/**
* Single wiring table. Add a provider here and it appears in 接线 / catalog / generation.
* Live keys (user-supplied, disposable): SuperXihe image, SuperXihe Grok, Volcengine Agent Plan, Civitai.
* Original Boundless slots kept as disabled templates so nothing was deleted.
*/
var STUDIO_PROVIDERS = [
	{
		id: "preset-superxihe-image",
		name: "SuperXihe 生图",
		adapter: "openai-compat",
		baseUrl: "https://superxihe.com/v1",
		apiKey: "sk-54340465b9c29c6810db2bf19740c3c39057c3db711b040cbd28d8a62c9ebb36",
		enabled: true,
		capabilities: ["image"],
		remark: "OpenAI 兼容 Images API：/images/generations",
		models: [
			"gpt-image-2",
			"gpt-image-1.5",
			"gpt-image-1"
		],
		textModels: [],
		imageModels: [
			"gpt-image-2",
			"gpt-image-1.5",
			"gpt-image-1"
		],
		videoModels: [],
		audioModels: [],
		endpoints: { images: "/images/generations" }
	},
	{
		id: "preset-superxihe-grok",
		name: "SuperXihe Grok",
		adapter: "xai-imagine",
		baseUrl: "https://superxihe.com/v1",
		apiKey: "sk-92f2462d95d3e1ae3336226b62af3d4f376aa9cb6c6279d52d1186092ecef4b9",
		enabled: true,
		capabilities: [
			"text",
			"image",
			"video"
		],
		remark: "Grok 文本 / Imagine 图视频。视频官方 /videos/generations。",
		models: [
			"grok-4.6",
			"grok-4.5",
			"grok-4.3",
			"grok-imagine-image-quality",
			"grok-imagine-image",
			"grok-imagine-video",
			"grok-imagine-video-1.5-preview"
		],
		textModels: [
			"grok-4.6",
			"grok-4.5",
			"grok-4.3"
		],
		imageModels: ["grok-imagine-image-quality", "grok-imagine-image"],
		videoModels: ["grok-imagine-video", "grok-imagine-video-1.5-preview"],
		audioModels: [],
		nsfw: true,
		endpoints: {
			chat: "/chat/completions",
			images: "/images/generations",
			videosCreate: "/videos/generations",
			videosPoll: "/videos/{id}"
		}
	},
	{
		id: "preset-volcengine-plan",
		name: "火山方舟 Agent Plan",
		adapter: "ark-plan",
		baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
		apiKey: "ark-8c2c51f6-b302-48fc-8f26-207f83bd8129-b50b0",
		enabled: true,
		capabilities: ["image", "video"],
		remark: "官方 Agent Plan /api/plan/v3。生图 Seedream 5.0 Lite 已实测。视频需 Medium+。",
		models: [
			"doubao-seedream-5.0-lite",
			"doubao-seedance-1.5-pro",
			"doubao-seedance-2.0",
			"doubao-seedance-2.0-fast",
			"doubao-seedance-2.0-mini"
		],
		textModels: [],
		imageModels: ["doubao-seedream-5.0-lite"],
		videoModels: [
			"doubao-seedance-1.5-pro",
			"doubao-seedance-2.0",
			"doubao-seedance-2.0-fast",
			"doubao-seedance-2.0-mini"
		],
		audioModels: [],
		endpoints: {
			images: "/images/generations",
			videosCreate: "/contents/generations/tasks",
			videosPoll: "/contents/generations/tasks/{id}"
		}
	},
	{
		id: "preset-civitai",
		name: "Civitai Orchestration",
		adapter: "civitai",
		baseUrl: "https://orchestration.civitai.com/v2/consumer/recipes",
		apiKey: "29d622653173c1960a0952118df72f49",
		enabled: true,
		capabilities: ["image", "video"],
		nsfw: true,
		remark: "官方 imageGen / videoGen。mature 默认开。Krea / Flux / SDXL / Anima / Seedream / LTX。",
		models: [...CIVITAI_IMAGE, ...CIVITAI_VIDEO],
		textModels: [],
		imageModels: CIVITAI_IMAGE,
		videoModels: CIVITAI_VIDEO,
		audioModels: [],
		endpoints: {
			images: "/imageGen",
			videosCreate: "/videoGen"
		}
	},
	{
		id: "preset-aliyun-dashscope",
		name: "阿里云百炼",
		adapter: "dashscope",
		baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
		apiKey: "",
		enabled: false,
		capabilities: [
			"text",
			"image",
			"video"
		],
		remark: "通义千问 / 万相。生图兼容 /images/generations，视频走 DashScope 原生异步。",
		models: [
			"qwen-plus",
			"qwen-max",
			"qwen-image-2.0-pro",
			"qwen-image-plus",
			"wan2.6-t2i",
			"wan2.6-t2v",
			"wan2.6-i2v",
			"happyhorse-1.1-t2v"
		],
		textModels: ["qwen-plus", "qwen-max"],
		imageModels: [
			"qwen-image-2.0-pro",
			"qwen-image-plus",
			"wan2.6-t2i"
		],
		videoModels: [
			"wan2.6-t2v",
			"wan2.6-i2v",
			"happyhorse-1.1-t2v"
		],
		audioModels: [],
		endpoints: {
			chat: "/chat/completions",
			images: "/images/generations"
		}
	},
	{
		id: "preset-aliyun-tokenplan",
		name: "阿里云 Token Plan",
		adapter: "dashscope",
		baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
		apiKey: "",
		enabled: false,
		capabilities: [
			"text",
			"image",
			"video",
			"audio"
		],
		remark: "阿里云 Token Plan 套餐端点。",
		models: [
			"qwen-image-2.0-pro",
			"wan2.7-image",
			"happyhorse-1.1-t2v",
			"qwen-audio-3.0-tts-plus"
		],
		textModels: [],
		imageModels: ["qwen-image-2.0-pro", "wan2.7-image"],
		videoModels: ["happyhorse-1.1-t2v"],
		audioModels: ["qwen-audio-3.0-tts-plus"],
		endpoints: { images: "/images/generations" }
	},
	{
		id: "preset-volcengine-ark",
		name: "火山方舟（标准 Ark）",
		adapter: "ark-plan",
		baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
		apiKey: "",
		enabled: false,
		capabilities: ["image", "video"],
		remark: "标准 /api/v3（非 Agent Plan）。模型 ID 带日期后缀。有 Agent Plan 请用上面那条。",
		models: ["doubao-seedream-5-0-lite-260128", "doubao-seedance-2-0-260128"],
		textModels: [],
		imageModels: ["doubao-seedream-5-0-lite-260128"],
		videoModels: ["doubao-seedance-2-0-260128"],
		audioModels: [],
		endpoints: {
			images: "/images/generations",
			videosCreate: "/contents/generations/tasks"
		}
	},
	{
		id: "preset-agnes-ai",
		name: "Agnes AI",
		adapter: "agnes",
		baseUrl: "https://apihub.agnes-ai.com/v1",
		apiKey: "",
		enabled: false,
		capabilities: [
			"text",
			"image",
			"video"
		],
		remark: "Agnes 多模态。视频 POST /videos，模型 agnes-video-v2.0。",
		models: [
			"agnes-2.5-flash",
			"agnes-image-2.1-flash",
			"agnes-video-v2.0"
		],
		textModels: ["agnes-2.5-flash", "agnes-2.5-pro-alpha"],
		imageModels: ["agnes-image-2.1-flash", "agnes-image-2.0-flash"],
		videoModels: ["agnes-video-v2.0"],
		audioModels: [],
		endpoints: {
			chat: "/chat/completions",
			images: "/images/generations",
			videosCreate: "/videos"
		}
	},
	{
		id: "preset-sensenova",
		name: "商汤日日新",
		adapter: "sensenova",
		baseUrl: "https://token.sensenova.cn/v1",
		apiKey: "",
		enabled: false,
		capabilities: ["text", "image"],
		remark: "无视频。生图 size 仅接受 2048x2048 等大尺寸。",
		models: ["sensenova-u1-fast", "sensenova-6.7-flash-lite"],
		textModels: ["sensenova-6.7-flash-lite"],
		imageModels: ["sensenova-u1-fast"],
		videoModels: [],
		audioModels: [],
		endpoints: {
			chat: "/chat/completions",
			images: "/images/generations"
		}
	},
	{
		id: "preset-fal",
		name: "Fal.ai",
		adapter: "fal",
		baseUrl: "https://fal.run",
		apiKey: "",
		enabled: false,
		capabilities: ["image"],
		nsfw: true,
		remark: "Flux 系列，Authorization: Key。成人向内容由模型自身策略决定，不含违法类别。",
		models: [
			"flux-dev",
			"flux-schnell",
			"flux-pro"
		],
		textModels: [],
		imageModels: [
			"flux-dev",
			"flux-schnell",
			"flux-pro"
		],
		videoModels: [],
		audioModels: [],
		endpoints: { images: "/fal-ai/flux/dev" }
	},
	{
		id: "preset-custom-compat",
		name: "自定义 OpenAI 兼容",
		adapter: "openai-compat",
		baseUrl: "https://api.example.com/v1",
		apiKey: "",
		enabled: false,
		capabilities: [
			"text",
			"image",
			"video"
		],
		remark: "自己的中转。按官方 Images / Chat / Videos 字段接线。",
		models: [],
		textModels: [],
		imageModels: [],
		videoModels: [],
		audioModels: [],
		endpoints: {
			chat: "/chat/completions",
			images: "/images/generations",
			videosCreate: "/videos/generations"
		}
	}
];
var STUDIO_ROUTES = {
	text: {
		providerId: "preset-superxihe-grok",
		model: "grok-4.6"
	},
	image: {
		providerId: "preset-volcengine-plan",
		model: "doubao-seedream-5.0-lite"
	},
	video: {
		providerId: "preset-superxihe-grok",
		model: "grok-imagine-video"
	},
	audio: {
		providerId: "preset-aliyun-tokenplan",
		model: "qwen-audio-3.0-tts-plus"
	}
};
function studioRelays() {
	return STUDIO_PROVIDERS.map((item) => createApiRelayProvider({
		id: item.id,
		name: item.name,
		baseUrl: item.baseUrl,
		apiKey: item.apiKey,
		adapterType: item.adapter,
		enabled: item.enabled,
		capabilities: item.capabilities,
		remark: item.remark,
		allowMatureContent: item.nsfw === true || item.adapter === "civitai" || item.adapter === "fal",
		models: item.models,
		textModels: item.textModels,
		imageModels: item.imageModels,
		videoModels: item.videoModels,
		audioModels: item.audioModels
	}));
}
new Set(STUDIO_PROVIDERS.map((item) => item.id).concat("legacy-default-relay"));
var META = {
	"doubao-seedream-5.0-lite": {
		tags: [
			"2K",
			"文生图",
			"图生图"
		],
		cost: "99 AFP",
		size: "2K",
		blurb: "商品图默认。官方 size=2K，无水印。已实测。"
	},
	"gpt-image-2": {
		tags: ["Images API"],
		cost: "中转",
		size: "1024",
		blurb: "OpenAI Images 兼容。"
	},
	"gpt-image-1.5": {
		tags: ["Images API"],
		cost: "中转",
		size: "1024",
		blurb: "上一档 GPT Image。"
	},
	"gpt-image-1": {
		tags: ["Images API"],
		cost: "中转",
		size: "1024",
		blurb: "基础 GPT Image。"
	},
	"grok-imagine-image": {
		tags: ["Imagine", "宽松"],
		nsfw: true,
		cost: "中转",
		blurb: "Imagine 生图，尺度比 GPT Image 松。"
	},
	"grok-imagine-image-quality": {
		tags: ["Imagine", "高质"],
		nsfw: true,
		cost: "中转",
		blurb: "Imagine 高质量档。"
	},
	"grok-imagine-video": {
		tags: ["5–10s", "Imagine"],
		nsfw: true,
		cost: "中转",
		size: "720p",
		blurb: "已实测出片。"
	},
	"grok-imagine-video-1.5-preview": {
		tags: ["预览", "Imagine"],
		nsfw: true,
		cost: "中转",
		size: "720p",
		blurb: "Imagine 1.5 预览档。"
	},
	"grok-4.6": {
		tags: ["故事导演"],
		nsfw: true,
		cost: "中转",
		blurb: "分镜分析默认。"
	},
	"grok-4.5": {
		tags: ["故事导演"],
		nsfw: true,
		cost: "中转",
		blurb: "备用文本模型。"
	},
	"doubao-seedance-1.5-pro": {
		tags: ["Medium+", "Agent Plan"],
		cost: "AFP",
		blurb: "Agent Plan Medium 起。Small 档会返回未开通。"
	},
	"doubao-seedance-2.0": {
		tags: ["Large+", "Agent Plan"],
		cost: "AFP",
		blurb: "走 contents/generations/tasks，不是 /api/v3。"
	},
	"doubao-seedance-2.0-fast": {
		tags: ["Large+", "加速"],
		cost: "AFP",
		blurb: "Seedance 2.0 加速档。"
	},
	"doubao-seedance-2.0-mini": {
		tags: ["Large+", "轻量"],
		cost: "AFP",
		blurb: "Seedance 2.0 轻量档。"
	},
	"flux-dev": {
		tags: ["NSFW", "Flux"],
		nsfw: true,
		cost: "Fal",
		blurb: "Fal Flux Dev，安全检查关闭。"
	},
	"flux-schnell": {
		tags: ["NSFW", "快"],
		nsfw: true,
		cost: "Fal",
		blurb: "Fal Flux Schnell。"
	},
	"flux-pro": {
		tags: ["NSFW", "Pro"],
		nsfw: true,
		cost: "Fal",
		blurb: "Fal Flux Pro。"
	}
};
for (const engine of CIVITAI_ENGINES) META[engine.id] = {
	tags: engine.tags,
	nsfw: engine.nsfw,
	cost: "Buzz",
	size: engine.kind === "image" ? "可调" : "官方",
	blurb: `Civitai ${engine.label}。mature 默认开。`
};
function kindOf(provider, model) {
	if (provider.videoModels.includes(model)) return "video";
	if (provider.audioModels.includes(model)) return "audio";
	if (provider.imageModels.includes(model)) return "image";
	return "text";
}
var STUDIO_CATALOG = STUDIO_PROVIDERS.flatMap((provider) => {
	return [.../* @__PURE__ */ new Set([
		...provider.imageModels,
		...provider.videoModels,
		...provider.textModels,
		...provider.audioModels
	])].map((model) => {
		const extra = META[model] || {};
		const kind = kindOf(provider, model);
		return {
			providerId: provider.id,
			provider: provider.name,
			model,
			kind,
			tags: extra.tags || provider.capabilities,
			nsfw: extra.nsfw ?? provider.nsfw ?? false,
			cost: extra.cost || (provider.enabled ? "已接线" : "待接线"),
			size: extra.size || "官方",
			docs: provider.remark,
			blurb: extra.blurb || provider.remark,
			wired: Boolean(provider.enabled && provider.apiKey)
		};
	});
});
function catalogKey(card) {
	return `${card.providerId}::${card.model}`;
}
function catalogByKind(kind) {
	return STUDIO_CATALOG.filter((item) => item.kind === kind);
}
function wiredCatalogByKind(kind) {
	const wired = catalogByKind(kind).filter((item) => item.wired);
	return wired.length ? wired : catalogByKind(kind);
}
function findCatalog(value) {
	return STUDIO_CATALOG.find((item) => catalogKey(item) === value);
}
//#endregion
export { catalogKey as a, findCatalog as c, studioProxyJson as d, studioRelays as f, catalogByKind as i, firstImageUrl as l, STUDIO_PROVIDERS as n, civitaiAdapter as o, wiredCatalogByKind as p, STUDIO_ROUTES as r, createApiRelayProvider as s, STUDIO_CATALOG as t, providerById as u };
