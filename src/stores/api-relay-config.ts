import { normalizeAudioCapabilityProfiles, type AudioCapabilityProfileId } from "@/services/api/audio-model-capabilities";
import {
    IMAGE_CAPABILITY_PROFILES,
    isImageCapabilityProfileId,
    normalizeImageCapabilityProfiles,
    type ImageCapabilityProfileId,
    type ImageCapabilityProfileSelection,
    type ImageOperation,
} from "@/services/api/image-model-capabilities";
import { normalizeVideoCapabilityProfiles, type VideoCapabilityProfileId } from "@/services/api/video-model-capabilities";
import {
    normalizeModelsDevMetadataRecord,
    type RelayModelCatalogMetadataRecord,
} from "@/services/api/models-dev-catalog";
import { CIVITAI_MATURE_POLICY_VERSION, civitaiAllowsMatureContent, isCivitaiAdapterType } from "@/services/api/civitai-orchestration";
import { createProviderCredentialId, hasProviderCredential, normalizeProviderCredentials, normalizeProviderKeyInput, reconcileProviderCredentialIds } from "@/stores/provider-credentials";

export type ApiCapability = "text" | "image" | "video" | "audio";
