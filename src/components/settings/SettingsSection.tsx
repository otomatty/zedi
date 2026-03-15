import React from "react";

/**
 *
 */
export type SettingsSectionId = "general" | "ai" | "storage";

interface SettingsSectionProps {
  id: SettingsSectionId;
  title: string;
  description: string;
  children: React.ReactNode;
}

/**
 *
 */
export /**
 *
 */
const SettingsSection: React.FC<SettingsSectionProps> = ({ id, title, description, children }) => {
  return (
    <section
      id={`section-${id}`}
      aria-labelledby={`section-${id}-title`}
      className="scroll-mt-24 space-y-4"
    >
      <div>
        <h2 id={`section-${id}-title`} className="text-xl font-semibold">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div>{children}</div>
    </section>
  );
};
