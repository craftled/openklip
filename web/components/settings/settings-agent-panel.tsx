"use client";

import { useEffect, useState } from "react";
import { AgentModelSelect } from "@/components/agent-model-select";
import {
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-panel-primitives";
import {
  type AgentModelId,
  DEFAULT_AGENT_MODEL,
  getDefaultAgentModel,
  subscribeDefaultAgent,
} from "@/lib/agent-preferences";

export function SettingsAgentPanel({
  defaultAgent,
  onDefaultAgentChange,
}: {
  defaultAgent: AgentModelId;
  onDefaultAgentChange: (model: AgentModelId) => void;
}) {
  const [agent, setAgent] = useState<AgentModelId>(
    defaultAgent ?? DEFAULT_AGENT_MODEL
  );

  useEffect(() => {
    setAgent(defaultAgent);
  }, [defaultAgent]);

  useEffect(() => {
    setAgent(getDefaultAgentModel());
    return subscribeDefaultAgent(setAgent);
  }, []);

  return (
    <SettingsSection title="Defaults">
      <SettingsRow
        control={
          <div className="w-full min-w-[12rem] sm:w-56">
            <AgentModelSelect
              defaultAgent={agent}
              onValueChange={onDefaultAgentChange}
              value={agent}
            />
          </div>
        }
        description="Pre-selected provider and model when you start a new chat."
        title="Default agent"
      />
    </SettingsSection>
  );
}
