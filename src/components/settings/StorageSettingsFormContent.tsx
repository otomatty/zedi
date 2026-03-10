import { StorageDestinationSection } from "./storage/StorageDestinationSection";
import { ExternalStorageProviderSelect } from "./storage/ExternalStorageProviderSelect";
import { StorageProviderSpecificForms } from "./storage/StorageProviderSpecificForms";
import { StorageTestResultAndGuide } from "./storage/StorageTestResultAndGuide";
import type { StorageSettingsFormContentProps } from "./storage/storageSettingsFormTypes";

export function StorageSettingsFormContent(props: StorageSettingsFormContentProps) {
  return (
    <>
      <StorageDestinationSection
        useExternalStorage={props.useExternalStorage}
        useExternalStorageEffective={props.useExternalStorageEffective}
        updateSettings={props.updateSettings}
        isSaving={props.isSaving}
        isTesting={props.isTesting}
      />
      <ExternalStorageProviderSelect
        useExternalStorageEffective={props.useExternalStorageEffective}
        effectiveProvider={props.effectiveProvider}
        currentProvider={props.currentProvider}
        updateSettings={props.updateSettings}
        isSaving={props.isSaving}
        isTesting={props.isTesting}
      />
      <StorageProviderSpecificForms
        useExternalStorageEffective={props.useExternalStorageEffective}
        settings={props.settings}
        showSecrets={props.showSecrets}
        setShowSecrets={props.setShowSecrets}
        updateConfig={props.updateConfig}
        isSaving={props.isSaving}
        isTesting={props.isTesting}
      />
      <StorageTestResultAndGuide
        testResult={props.testResult}
        currentProvider={props.currentProvider}
      />
    </>
  );
}
