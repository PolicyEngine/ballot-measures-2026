'use client';

import { useState } from 'react';
import {
  MAX_AGE,
  MAX_DEPENDENTS,
  MIN_ADULT_AGE,
  newDependent,
  parseMoneyInput,
  validateHouseholdForm,
  type DependentFormValue,
  type HouseholdFormErrors,
  type HouseholdFormValues,
} from '@/lib/householdForm';
import type { HouseholdRequest } from '@/lib/householdApi';

interface Props {
  /** Measure slug and tax year sent with the request. */
  measure: string;
  year: number;
  values: HouseholdFormValues;
  onChange: (values: HouseholdFormValues) => void;
  /** Called with the validated payload. */
  onSubmit: (request: HouseholdRequest) => void;
  /** Disables the button while a request is in flight. */
  busy?: boolean;
  /** Short note under the dependents list. */
  dependentsNote?: string;
}

const INPUT_CLASS =
  'w-full px-3 py-2 bg-white border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors';

const inputClass = (invalid: boolean) =>
  `${INPUT_CLASS} ${invalid ? 'border-destructive' : 'border-gray-200'}`;

const formatMoney = (value: number) => value.toLocaleString('en-US');

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs text-destructive" role="alert">
      {message}
    </p>
  );
}

function MoneyInput({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-600 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          value={formatMoney(value)}
          onChange={(e) => onChange(parseMoneyInput(e.target.value))}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${inputClass(Boolean(error))} pl-6`}
        />
      </div>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export default function HouseholdForm({
  measure,
  year,
  values,
  onChange,
  onSubmit,
  busy = false,
  dependentsNote,
}: Props) {
  const [errors, setErrors] = useState<HouseholdFormErrors>({});
  const [showErrors, setShowErrors] = useState(false);

  const update = (patch: Partial<HouseholdFormValues>) => {
    const next = { ...values, ...patch };
    onChange(next);
    if (showErrors) setErrors(validateHouseholdForm(next, measure, year).errors);
  };

  const updateDependent = (key: number, patch: Partial<DependentFormValue>) =>
    update({
      dependents: values.dependents.map((d) => (d.key === key ? { ...d, ...patch } : d)),
    });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateHouseholdForm(values, measure, year);
    setErrors(result.errors);
    setShowErrors(true);
    if (result.request) onSubmit(result.request);
  };

  const visible = showErrors ? errors : {};

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Your household"
      className="bg-gray-50 rounded-xl p-6 md:p-8 border border-gray-200 shadow-sm"
    >
      <h2 className="text-xl font-bold text-gray-900 mb-6">Your household</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-4">
        <div>
          <label htmlFor="age-head" className="block text-sm font-medium text-gray-600 mb-1.5">
            Your age
          </label>
          <input
            id="age-head"
            type="number"
            inputMode="numeric"
            min={MIN_ADULT_AGE}
            max={MAX_AGE}
            value={values.ageHead}
            onChange={(e) => update({ ageHead: e.target.value })}
            aria-invalid={Boolean(visible.ageHead)}
            aria-describedby={visible.ageHead ? 'age-head-error' : undefined}
            className={inputClass(Boolean(visible.ageHead))}
          />
          <FieldError id="age-head-error" message={visible.ageHead} />
        </div>

        <MoneyInput
          id="income"
          label="Your employment income"
          value={values.income}
          onChange={(income) => update({ income })}
          error={visible.income}
        />

        <div>
          <span className="block text-sm font-medium text-gray-600 mb-1.5">Marital status</span>
          <label
            htmlFor="married"
            className="flex items-center gap-3 w-full px-3 py-2 bg-white border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
          >
            <input
              type="checkbox"
              id="married"
              checked={values.married}
              onChange={(e) => update({ married: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">Married</span>
          </label>
        </div>

        {values.married && (
          <>
            <div>
              <label htmlFor="age-spouse" className="block text-sm font-medium text-gray-600 mb-1.5">
                Spouse age
              </label>
              <input
                id="age-spouse"
                type="number"
                inputMode="numeric"
                min={MIN_ADULT_AGE}
                max={MAX_AGE}
                value={values.ageSpouse}
                onChange={(e) => update({ ageSpouse: e.target.value })}
                aria-invalid={Boolean(visible.ageSpouse)}
                aria-describedby={visible.ageSpouse ? 'age-spouse-error' : undefined}
                className={inputClass(Boolean(visible.ageSpouse))}
              />
              <FieldError id="age-spouse-error" message={visible.ageSpouse} />
            </div>
            <MoneyInput
              id="spouse-income"
              label="Spouse employment income"
              value={values.spouseIncome}
              onChange={(spouseIncome) => update({ spouseIncome })}
              error={visible.spouseIncome}
            />
          </>
        )}
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-gray-600 mb-2">
          Dependents ({values.dependents.length} of {MAX_DEPENDENTS})
        </legend>
        {values.dependents.length === 0 && <p className="text-sm text-gray-500 mb-2">No dependents.</p>}
        <ul className="space-y-2">
          {values.dependents.map((d, i) => {
            const ageError = visible.dependentAges?.[d.key];
            const ageId = `dependent-${d.key}-age`;
            return (
              <li
                key={d.key}
                className="flex flex-wrap items-start gap-x-4 gap-y-2 bg-white border border-gray-200 rounded-lg px-3 py-2"
              >
                <div className="w-28">
                  <label htmlFor={ageId} className="block text-xs font-medium text-gray-500 mb-1">
                    Dependent {i + 1} age
                  </label>
                  <input
                    id={ageId}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_AGE}
                    value={d.age}
                    onChange={(e) => updateDependent(d.key, { age: e.target.value })}
                    aria-invalid={Boolean(ageError)}
                    aria-describedby={ageError ? `${ageId}-error` : undefined}
                    className={`${inputClass(Boolean(ageError))} py-1.5`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => update({ dependents: values.dependents.filter((x) => x.key !== d.key) })}
                  className="ml-auto mt-6 text-sm text-gray-500 hover:text-gray-800 underline"
                  aria-label={`Remove dependent ${i + 1}`}
                >
                  Remove
                </button>
                {ageError && (
                  <div className="w-full">
                    <FieldError id={`${ageId}-error`} message={ageError} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => update({ dependents: [...values.dependents, newDependent()] })}
          disabled={values.dependents.length >= MAX_DEPENDENTS}
          className="mt-3 px-4 py-2 rounded-lg text-sm font-medium border border-primary-500 text-primary-700 bg-white hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add dependent
        </button>
        <FieldError id="dependents-error" message={visible.dependents} />
        {dependentsNote && <p className="text-xs text-gray-500 mt-2">{dependentsNote}</p>}
      </fieldset>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="py-3 px-10 rounded-lg font-semibold text-white bg-primary-500 hover:bg-primary-600 active:bg-primary-700 transition-all shadow-sm hover:shadow-md sm:w-auto w-full disabled:opacity-60 disabled:cursor-wait"
        >
          {busy ? 'Calculating…' : 'Calculate impact'}
        </button>
        {showErrors && Object.keys(errors).length > 0 && (
          <p className="text-sm text-destructive">Fix the highlighted fields to calculate.</p>
        )}
      </div>
    </form>
  );
}
