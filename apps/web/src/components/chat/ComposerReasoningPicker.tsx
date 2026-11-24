import {
  isReasoningControl,
  selectableProviderOptionChoices,
} from "@t3tools/client-runtime/model-traits";
import { ChevronDownIcon, ZapIcon } from "lucide-react";
import { useGT } from "gt-react";
import type { CSSProperties } from "react";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { ComposerControl, type ComposerControlSize } from "./ComposerControl";
import { composerFloatingLayerProps } from "./composerEventScope";
import { type TraitsSelectionInput, useTraitsSelection } from "./TraitsPicker";
import "./composer-agent-picker.css";

export function ComposerReasoningPicker(props: {
  traits: TraitsSelectionInput;
  size: ComposerControlSize;
}) {
  const gt = useGT();
  const traits = useTraitsSelection(props.traits);
  const descriptor = traits.selectDescriptors.find(isReasoningControl);
  if (!descriptor || traits.modelIsUnavailable) return null;
  const choices = selectableProviderOptionChoices(descriptor);
  if (choices.length < 2) return null;
  const value = traits.selectValue(descriptor);
  const selected = Math.max(
    0,
    choices.findIndex((choice) => choice.id === value),
  );
  const locked =
    traits.ultrathinkInBodyText && descriptor.id === traits.primarySelectDescriptor?.id;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <ComposerControl
            size={props.size}
            data-telos-picker="agent-trigger"
            aria-label={descriptor.label}
            disabled={locked}
          />
        }
      >
        <span data-telos-picker="reasoning-bolts" aria-hidden="true">
          {Array.from(
            { length: Math.max(1, Math.round(((selected + 1) / choices.length) * 4)) },
            (_, index) => (
              <ZapIcon key={index} />
            ),
          )}
        </span>
        <span data-composer-control-label>{choices[selected]?.label}</span>
        <ChevronDownIcon className="size-3 opacity-50" />
      </PopoverTrigger>
      <PopoverPopup
        {...composerFloatingLayerProps}
        side="top"
        align="start"
        padding="none"
        data-telos-picker="reasoning-popup"
      >
        <div
          data-telos-picker="reasoning-slider"
          style={{ "--progress": `${(selected / (choices.length - 1)) * 100}%` } as CSSProperties}
        >
          <div data-telos-picker="reasoning-track" aria-hidden="true">
            <span data-telos-picker="reasoning-fill" />
            {choices.map((choice, index) => (
              <span
                key={choice.id}
                data-telos-picker="reasoning-tick"
                style={{ left: `${(index / (choices.length - 1)) * 100}%` }}
              />
            ))}
            <span data-telos-picker="reasoning-thumb" />
          </div>
          <input
            type="range"
            min={0}
            max={choices.length - 1}
            step={1}
            value={selected}
            aria-label={descriptor.label}
            aria-valuetext={choices[selected]?.label}
            onChange={(event) => {
              const choice = choices[Number(event.target.value)];
              if (choice) traits.changeSelect(descriptor, choice.id);
            }}
          />
        </div>
        <div data-telos-picker="reasoning-ends" aria-hidden="true">
          <span>{gt("Faster")}</span>
          <span>{gt("Smarter")}</span>
        </div>
        <div data-telos-picker="reasoning-value" aria-live="polite">
          {choices[selected]?.label ?? gt("Reasoning")}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
