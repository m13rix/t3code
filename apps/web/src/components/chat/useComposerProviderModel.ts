import {
  type DraftId,
  deriveEffectiveComposerModelState,
  useComposerDraftModelState,
} from "../../composerDraftStore";
import { draftModelSelectionApplies } from "../../lib/chatThreadActions";
import {
  type ModelSelection,
  type ProjectId,
  ProviderDriverKind,
  piNamedAgentName,
  type ScopedThreadRef,
  type ServerProvider,
} from "@t3tools/contracts";
import {
  NO_PROVIDER_MODEL_SELECTION,
  providerInstanceEntriesFor,
  providerEntriesForThread,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import { type UnifiedSettings } from "@t3tools/contracts/settings";
import { getComposerPromptInjectionState, getComposerProviderState } from "./composerProviderState";
import { resolveComposerProviderSelection } from "../ChatView.logic";

const NO_PROVIDER_MODELS: ServerProvider["models"] = [];

/**
 * The provider instances the composer offers, which one is selected, and the model and options
 * the draft resolves to on it. The draft store is read first so every derivation follows the only
 * hook here; in the composer body they would straddle its later hooks and lose their cache.
 */
export function useComposerProviderModel(
  input: Omit<Parameters<typeof resolveComposerProviderSelection>[0], "entries"> & {
    readonly providerStatuses: ReadonlyArray<ServerProvider>;
    readonly settings: UnifiedSettings;
    readonly activeProjectId: ProjectId | null;
    readonly threadRef: ScopedThreadRef | DraftId;
    readonly threadModelSelection: ModelSelection | null | undefined;
    readonly projectModelSelection: ModelSelection | null | undefined;
    readonly promptInjectionState: ReturnType<typeof getComposerPromptInjectionState>;
    readonly threadStarted: boolean;
    readonly isDraftThread: boolean;
    readonly workspaceCwd: string | null;
    readonly projectWorkspaceCwd: string | null;
  },
) {
  const {
    providerStatuses,
    settings,
    activeProjectId,
    threadRef,
    threadModelSelection,
    projectModelSelection,
    promptInjectionState,
    candidateInstanceIds,
    lockedProvider,
    lockedInstanceId,
    threadStarted,
    isDraftThread,
    workspaceCwd,
    projectWorkspaceCwd,
  } = input;
  const draftModelState = useComposerDraftModelState(threadRef);
  const entries = providerInstanceEntriesFor(providerStatuses, settings, activeProjectId).filter(
    (entry) => {
      const workspaces = entry.snapshot.piNamedAgentWorkspaces;
      return (
        !workspaces ||
        workspaces.some(
          (cwd) => cwd === workspaceCwd || (isDraftThread && cwd === projectWorkspaceCwd),
        ) ||
        (threadStarted && entry.instanceId === lockedInstanceId)
      );
    },
  );
  const providerInstanceEntries: ReadonlyArray<ProviderInstanceEntry> = providerEntriesForThread(
    entries,
    isDraftThread,
  );
  const resolvedSelection = resolveComposerProviderSelection({
    entries: providerInstanceEntries,
    candidateInstanceIds: [
      draftModelSelectionApplies(draftModelState, threadStarted)
        ? draftModelState.activeProvider
        : null,
      ...candidateInstanceIds,
    ],
    lockedProvider,
    lockedInstanceId,
  });
  const lockedNamedId =
    threadStarted && lockedInstanceId && piNamedAgentName(lockedInstanceId)
      ? lockedInstanceId
      : undefined;
  const lockedEntry = lockedNamedId
    ? providerInstanceEntries.find(
        (entry) => entry.instanceId === lockedNamedId && entry.enabled && entry.isAvailable,
      )
    : undefined;
  const selection = lockedNamedId
    ? {
        ...resolvedSelection,
        selectedProviderEntry: lockedEntry,
        requestedInstanceId: lockedNamedId,
        requestedDriverKind: ProviderDriverKind.make("pi"),
        unavailableProviderInstanceId: lockedEntry ? undefined : lockedNamedId,
      }
    : resolvedSelection;
  const selectedInstanceId =
    lockedNamedId ??
    selection.selectedProviderEntry?.instanceId ??
    NO_PROVIDER_MODEL_SELECTION.instanceId;
  const selectedProvider: ProviderDriverKind =
    selection.selectedProviderEntry?.driverKind ?? selection.requestedDriverKind;
  const modelState = deriveEffectiveComposerModelState({
    draft: draftModelState,
    threadStarted,
    providers: providerStatuses,
    selectedProvider,
    selectedInstanceId,
    requestedInstanceId: selection.requestedInstanceId,
    threadModelSelection,
    projectModelSelection,
    settings,
  });
  const selectedProviderModels = selection.selectedProviderEntry?.models ?? NO_PROVIDER_MODELS;
  const composerProviderState = getComposerProviderState({
    provider: selectedProvider,
    model: modelState.selectedModel,
    models: selectedProviderModels,
    promptInjectionState,
    modelOptions: modelState.modelOptions?.[selectedInstanceId],
  });
  return {
    providerInstanceEntries,
    ...selection,
    selectedInstanceId,
    selectedProvider,
    selectedProviderModels,
    composerModelOptions: modelState.modelOptions,
    selectedModel: modelState.selectedModel,
    composerProviderState,
  };
}
