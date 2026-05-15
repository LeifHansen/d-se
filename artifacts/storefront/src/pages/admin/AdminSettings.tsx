import { useEffect, useState } from "react";
import {
  useGetAdminQuarantineDigestSettings,
  useUpdateAdminQuarantineDigestSettings,
  getGetAdminQuarantineDigestSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "./AdminLayout";

type Frequency = "off" | "immediate" | "daily" | "weekly";

const OPTIONS: { value: Frequency; label: string; hint: string }[] = [
  {
    value: "off",
    label: "Off",
    hint: "Don't send the spam quarantine digest at all.",
  },
  {
    value: "immediate",
    label: "Immediately",
    hint: "Email admins as soon as a message is quarantined.",
  },
  {
    value: "daily",
    label: "Daily",
    hint: "One digest per 24 hours covering the last day's quarantined messages.",
  },
  {
    value: "weekly",
    label: "Weekly",
    hint: "One digest every 7 days covering the past week's quarantined messages.",
  },
];

export default function AdminSettings() {
  const queryClient = useQueryClient();
  const settings = useGetAdminQuarantineDigestSettings();
  const updateSettings = useUpdateAdminQuarantineDigestSettings();

  const [selected, setSelected] = useState<Frequency | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (settings.data && selected === null) {
      setSelected(settings.data.frequency as Frequency);
    }
  }, [settings.data, selected]);

  const current = (settings.data?.frequency ?? null) as Frequency | null;
  const isDirty = selected !== null && selected !== current;

  async function onSave() {
    if (!selected) return;
    setSavedNotice(false);
    await updateSettings.mutateAsync({ data: { frequency: selected } });
    await queryClient.invalidateQueries({
      queryKey: getGetAdminQuarantineDigestSettingsQueryKey(),
    });
    setSavedNotice(true);
  }

  return (
    <AdminLayout title="Settings">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure how the storefront notifies admins about activity.
          </p>
        </div>

        <section
          className="rounded-lg border border-border bg-card"
          aria-labelledby="digest-heading"
          data-testid="panel-quarantine-digest"
        >
          <header className="border-b border-border px-5 py-3">
            <h2 id="digest-heading" className="text-sm font-semibold">
              Quarantine digest frequency
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose how often the spam quarantine digest email is sent to{" "}
              <code>ADMIN_EMAILS</code>.
            </p>
          </header>

          <div className="px-5 py-4">
            {settings.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : settings.isError ? (
              <p
                className="text-sm text-destructive"
                data-testid="text-settings-error"
              >
                Couldn't load settings.{" "}
                {(settings.error as Error | undefined)?.message ?? ""}
              </p>
            ) : (
              <fieldset
                className="space-y-3"
                data-testid="digest-frequency-options"
              >
                <legend className="sr-only">Digest frequency</legend>
                {OPTIONS.map((opt) => {
                  const isSelected = selected === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                        isSelected
                          ? "border-foreground/60 bg-foreground/5"
                          : "border-border hover:bg-foreground/5"
                      }`}
                      data-testid={`digest-option-${opt.value}`}
                    >
                      <input
                        type="radio"
                        name="digest-frequency"
                        value={opt.value}
                        checked={isSelected}
                        onChange={() => {
                          setSelected(opt.value);
                          setSavedNotice(false);
                        }}
                        className="mt-1"
                      />
                      <span>
                        <span className="block text-sm font-medium">
                          {opt.label}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {opt.hint}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={onSave}
                disabled={
                  !isDirty || updateSettings.isPending || settings.isLoading
                }
                className="inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="button-save-digest-frequency"
              >
                {updateSettings.isPending ? "Saving…" : "Save"}
              </button>
              {updateSettings.isError ? (
                <span
                  className="text-sm text-destructive"
                  data-testid="text-save-error"
                >
                  Couldn't save.{" "}
                  {(updateSettings.error as Error | undefined)?.message ?? ""}
                </span>
              ) : savedNotice && !isDirty ? (
                <span
                  className="text-sm text-emerald-600 dark:text-emerald-400"
                  data-testid="text-save-success"
                >
                  Saved.
                </span>
              ) : null}
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Setting <code>DISABLE_CONTACT_QUARANTINE_DIGEST=1</code> still
              disables the scheduler entirely, regardless of the choice above.
            </p>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
