import {
  defaultInstanceIdForDriver,
  piNamedAgentName,
  ProviderDriverKind,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import { useGT } from "gt-react";
import { BotIcon, BrainIcon, CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import type { ProviderInstanceEntry } from "../../providerInstances";
import { Input } from "../ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { ComposerControl, type ComposerControlSize } from "./ComposerControl";
import { composerFloatingLayerProps } from "./composerEventScope";
import "./composer-agent-picker.css";

export function ComposerAgentPicker(props: {
  selectedInstanceId: ProviderInstanceId;
  entries: ReadonlyArray<ProviderInstanceEntry>;
  size: ComposerControlSize;
  disabled: boolean;
  onSelect: (id: ProviderInstanceId) => void;
}) {
  const gt = useGT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const autoId = defaultInstanceIdForDriver(ProviderDriverKind.make("pi"));
  const selectedName = piNamedAgentName(props.selectedInstanceId);
  const entries = props.entries.filter((entry) => piNamedAgentName(entry.instanceId));
  const search = query.trim().toLowerCase();
  const matches = entries.filter((entry) =>
    piNamedAgentName(entry.instanceId)?.toLowerCase().includes(search),
  );
  const showAuto = !search || "auto".includes(search);
  const pick = (id: ProviderInstanceId) => {
    props.onSelect(id);
    setOpen(false);
    setQuery("");
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <ComposerControl
            size={props.size}
            disabled={props.disabled}
            data-telos-picker="agent-trigger"
            aria-label={gt("Select agent")}
          />
        }
      >
        {selectedName ? (
          <BotIcon className="size-4" />
        ) : (
          <BrainIcon className="size-4 text-primary" />
        )}
        <span data-composer-control-label className="max-w-32 truncate">
          {selectedName ?? gt("Auto")}
        </span>
        <ChevronDownIcon className="size-3 opacity-50" />
      </PopoverTrigger>
      <PopoverPopup
        {...composerFloatingLayerProps}
        side="top"
        align="start"
        padding="none"
        data-telos-picker="agent-popup"
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          const rows = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              '[role="option"]:not(:disabled)',
            ),
          );
          if (!rows.length) return;
          const index = rows.findIndex((row) => row === document.activeElement);
          const next =
            index < 0
              ? 0
              : (index + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
          event.preventDefault();
          rows[next]?.focus();
        }}
        touchBackdrop
      >
        <div data-telos-picker="agent-search">
          <SearchIcon className="size-4 shrink-0" />
          <Input
            unstyled
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={gt("Search agents")}
            aria-label={gt("Search agents")}
          />
        </div>
        <div data-telos-picker="agent-scroll" role="listbox" aria-label={gt("Select agent")}>
          {showAuto ? (
            <button
              type="button"
              role="option"
              aria-selected={!selectedName}
              data-telos-picker="agent-row"
              data-telos-agent-auto
              onClick={() => pick(autoId)}
            >
              <BrainIcon className="size-5 text-primary" />
              <span>{gt("Auto")}</span>
              {!selectedName && <CheckIcon className="ms-auto size-4" />}
            </button>
          ) : null}
          {showAuto && matches.length > 0 ? <div data-telos-picker="agent-divider" /> : null}
          {matches.map((entry) => {
            const name = piNamedAgentName(entry.instanceId);
            return (
              <button
                type="button"
                role="option"
                aria-selected={entry.instanceId === props.selectedInstanceId}
                disabled={!entry.enabled || !entry.isAvailable}
                data-telos-picker="agent-row"
                key={entry.instanceId}
                onClick={() => pick(entry.instanceId)}
              >
                <BotIcon className="size-5 text-primary" />
                <span className="truncate">{name}</span>
                {entry.instanceId === props.selectedInstanceId && (
                  <CheckIcon className="ms-auto size-4" />
                )}
              </button>
            );
          })}
          {!showAuto && matches.length === 0 ? (
            <div data-telos-picker="agent-empty">{gt("No agents found")}</div>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
