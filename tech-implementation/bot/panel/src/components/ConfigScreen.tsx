// The Config section (spec 2026-07-27 §3): editing the deployment's public
// profile — what the (separately built) welcome page shows about this
// village. Presentation only: there is deliberately no field here for the
// village name, locale, categories, emergency line or anything else that
// belongs to config.yaml or the alert path.
//
// One record, no modal: unlike Devices, there is exactly one row and it is
// always being edited, so the form lives directly on the screen rather than
// behind an "Add"/"Edit" action. The responsible-people list borrows
// DeviceFormModal's controlled-input idiom, extended with up/down/remove
// per row rather than inventing a different one.

import { type FormEvent, useState } from "react";
import { ApiError } from "../api/client.ts";
import type { ResponsiblePerson, VillageProfile, VillageProfileWrite } from "../api/types.ts";
import { useVillageProfile } from "../hooks/useVillageProfile.ts";
import { useStrings } from "../i18n/context.tsx";
import { ErrorView } from "./ErrorView.tsx";
import { LoadingView } from "./LoadingView.tsx";

// Client-side hints only, kept in lockstep by hand with the real limits in
// src/panel/api.ts (same discipline as api/types.ts's wire types) — the
// backend is what actually enforces these.
const MAX_PHOTO_URL_LENGTH = 2000;
const MAX_INTRO_TEXT_LENGTH = 2000;
const MAX_PERSON_NAME_LENGTH = 200;
const MAX_PERSON_ROLE_LENGTH = 200;
const MAX_RESPONSIBLE_PEOPLE = 50;

export function ConfigScreen() {
  const s = useStrings();
  const { state, reload, save } = useVillageProfile();

  return (
    <div className="config-screen">
      <header className="app-header">
        <h1>{s.config.heading}</h1>
      </header>

      {state.status === "loading" && <LoadingView />}

      {state.status === "error" && <ErrorView message={state.message} onRetry={reload} />}

      {state.status === "loaded" && <ConfigForm profile={state.profile} onSave={save} />}
    </div>
  );
}

/** A row being edited. `key` is a stable local identity for React (and for
 *  drag-free reordering) independent of the person's name — using the array
 *  index instead would make an input jump to the wrong row on remove/move. */
interface PersonRow {
  key: string;
  name: string;
  role: string;
}

function toRows(people: ResponsiblePerson[]): PersonRow[] {
  return people.map((p) => ({ key: crypto.randomUUID(), name: p.name, role: p.role }));
}

/** Every field name this screen already shows an inline error for. */
function isKnownField(field: string | null, peopleCount: number): boolean {
  if (!field) return false;
  if (field === "escudoPhone" || field === "photoUrl" || field === "introText") return true;
  if (field === "responsiblePeople") return true;
  for (let i = 0; i < peopleCount; i++) {
    if (field === `responsiblePeople.${i}.name` || field === `responsiblePeople.${i}.role`) {
      return true;
    }
  }
  return false;
}

function ConfigForm(
  { profile, onSave }: {
    profile: VillageProfile;
    onSave: (body: VillageProfileWrite) => Promise<VillageProfile>;
  },
) {
  const s = useStrings();

  const [phone, setPhone] = useState(profile.escudoPhone ?? "");
  const [photoUrl, setPhotoUrl] = useState(profile.photoUrl ?? "");
  const [introText, setIntroText] = useState(profile.introText ?? "");
  const [people, setPeople] = useState<PersonRow[]>(() => toRows(profile.responsiblePeople));

  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which field the last error concerns, e.g. "escudoPhone" or
  // "responsiblePeople.1.role" — matched against each input below so the
  // message shows next to the field that was actually wrong (spec 3.2).
  const [errorField, setErrorField] = useState<string | null>(null);

  function clearFeedback() {
    setSaved(false);
    setError(null);
    setErrorField(null);
  }

  function addPerson() {
    clearFeedback();
    setPeople((prev) => [...prev, { key: crypto.randomUUID(), name: "", role: "" }]);
  }

  function removePerson(key: string) {
    clearFeedback();
    setPeople((prev) => prev.filter((p) => p.key !== key));
  }

  function movePerson(key: string, direction: -1 | 1) {
    clearFeedback();
    setPeople((prev) => {
      const index = prev.findIndex((p) => p.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function updatePerson(key: string, field: "name" | "role", value: string) {
    clearFeedback();
    setPeople((prev) => prev.map((p) => (p.key === key ? { ...p, [field]: value } : p)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    clearFeedback();
    setSubmitting(true);
    try {
      const result = await onSave({
        escudoPhone: phone,
        photoUrl,
        introText,
        responsiblePeople: people.map(({ name, role }) => ({ name, role })),
      });
      // Re-sync with what was actually stored (trimmed, normalised) so the
      // form shows the same thing the welcome page will read.
      setPhone(result.escudoPhone ?? "");
      setPhotoUrl(result.photoUrl ?? "");
      setIntroText(result.introText ?? "");
      setPeople(toRows(result.responsiblePeople));
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrorField(err.field ?? null);
      } else {
        setError(s.genericError);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="config-form" onSubmit={handleSubmit}>
      <p className="config-form__intro">{s.config.intro}</p>

      <div className="form-field">
        <label htmlFor="config-phone">{s.config.phoneLabel}</label>
        <input
          id="config-phone"
          type="tel"
          placeholder="+34600111222"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            clearFeedback();
          }}
        />
        <p className="form-field__help">{s.config.phoneHelp}</p>
        {errorField === "escudoPhone" && (
          <p className="form-error" role="alert">{error}</p>
        )}
      </div>

      <div className="form-field">
        <label htmlFor="config-photo">{s.config.photoLabel}</label>
        <input
          id="config-photo"
          type="url"
          placeholder="https://…"
          maxLength={MAX_PHOTO_URL_LENGTH}
          value={photoUrl}
          onChange={(e) => {
            setPhotoUrl(e.target.value);
            clearFeedback();
          }}
        />
        <p className="form-field__help">{s.config.photoHelp}</p>
        {errorField === "photoUrl" && (
          <p className="form-error" role="alert">{error}</p>
        )}
      </div>

      <div className="form-field">
        <label htmlFor="config-intro">{s.config.introTextLabel}</label>
        <textarea
          id="config-intro"
          rows={4}
          maxLength={MAX_INTRO_TEXT_LENGTH}
          value={introText}
          onChange={(e) => {
            setIntroText(e.target.value);
            clearFeedback();
          }}
        />
        <p className="form-field__help">{s.config.introTextHelp}</p>
        {errorField === "introText" && (
          <p className="form-error" role="alert">{error}</p>
        )}
      </div>

      <fieldset className="config-people">
        <legend>{s.config.peopleHeading}</legend>
        {/* Spec 3.4: whoever enters a name is responsible for having told
            that person it will appear publicly. Said plainly, next to the
            list, in both locales. */}
        <p className="config-people__notice" role="note">{s.config.peopleNotice}</p>

        {/* A list-level rejection (too many people) has no single row to
            attach to, so it shows here instead. */}
        {errorField === "responsiblePeople" && (
          <p className="form-error" role="alert">{error}</p>
        )}

        {people.length === 0 && <p className="config-people__empty">{s.config.peopleEmpty}</p>}

        {people.map((person, index) => (
          <div className="config-person-row" key={person.key}>
            <div className="form-field config-person-row__name">
              <label htmlFor={`person-name-${person.key}`}>{s.config.nameLabel}</label>
              <input
                id={`person-name-${person.key}`}
                type="text"
                maxLength={MAX_PERSON_NAME_LENGTH}
                value={person.name}
                onChange={(e) => updatePerson(person.key, "name", e.target.value)}
              />
              {errorField === `responsiblePeople.${index}.name` && (
                <p className="form-error" role="alert">{error}</p>
              )}
            </div>

            <div className="form-field config-person-row__role">
              <label htmlFor={`person-role-${person.key}`}>{s.config.roleLabel}</label>
              <input
                id={`person-role-${person.key}`}
                type="text"
                maxLength={MAX_PERSON_ROLE_LENGTH}
                value={person.role}
                onChange={(e) => updatePerson(person.key, "role", e.target.value)}
              />
              {errorField === `responsiblePeople.${index}.role` && (
                <p className="form-error" role="alert">{error}</p>
              )}
            </div>

            <div className="config-person-row__actions">
              <button
                type="button"
                onClick={() => movePerson(person.key, -1)}
                disabled={index === 0}
                aria-label={s.config.moveUp}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => movePerson(person.key, 1)}
                disabled={index === people.length - 1}
                aria-label={s.config.moveDown}
              >
                ↓
              </button>
              <button
                type="button"
                className="button--danger-text"
                onClick={() => removePerson(person.key)}
                aria-label={s.config.removePerson}
              >
                ×
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addPerson}
          disabled={people.length >= MAX_RESPONSIBLE_PEOPLE}
        >
          {s.config.addPerson}
        </button>
      </fieldset>

      {/* Every field-named error above is shown next to its own field; this
          is the fallback for one that isn't — a malformed body (no field at
          all) or, defensively, a field name this screen doesn't recognise
          yet, so an error is never silently dropped. */}
      {error && !isKnownField(errorField, people.length) && (
        <p className="form-error" role="alert">{error}</p>
      )}

      <div className="config-form__actions">
        <button type="submit" className="button--primary" disabled={submitting}>
          {submitting ? s.config.saving : s.config.save}
        </button>
        {saved && <span className="config-form__saved" role="status">{s.config.saved}</span>}
      </div>
    </form>
  );
}
