import { useState } from "react";
import { createRoot } from "react-dom/client";
import { useFieldArray, useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { formSchema, type FormInput, type FormOutput } from "./schema.js";

declare const __FORM_SCHEMA_SOURCE__: string;

const initialValues: FormInput = { title: "", items: [{ name: "", quantity: "1" }] };

function App() {
  const [submitted, setSubmitted] = useState<FormOutput | null>(null);
  const [shippingEnabled, setShippingEnabled] = useState(false);
  const { register, control, handleSubmit, reset, setValue, unregister, formState: { errors } } = useForm<
    FormInput, undefined, FormOutput
  >({ resolver: standardSchemaResolver(formSchema), defaultValues: initialValues });
  const { fields, append, remove, move } = useFieldArray({ control, name: "items" });
  const arrayError = errors.items?.root?.message ?? errors.items?.message;
  const windowError = errors.shipping?.windows?.[0]?.root?.message ?? errors.shipping?.windows?.[0]?.message;

  return <main>
    <span className="eyebrow">LOCULUS × REACT HOOK FORM</span>
    <h1>Order form with line items</h1>
    <p>Add and remove rows to explore nested errors and type conversion on submission.</p>
    <p className="hint">Validation uses Loculus with the Standard Schema resolver. <a href="#validation-schema">View the active schema</a>.</p>
    <form noValidate onSubmit={handleSubmit(data => setSubmitted(data), () => setSubmitted(null))}>
      <label htmlFor="title">Order title</label>
      <input id="title" {...register("title")} aria-invalid={!!errors.title}
        aria-describedby={errors.title ? "title-error" : undefined} placeholder="Weekend shopping" />
      {errors.title && <p id="title-error" role="alert">{errors.title.message}</p>}
      <label className="toggle"><input type="checkbox" checked={shippingEnabled} onChange={event => {
        const enabled = event.target.checked;
        setShippingEnabled(enabled);
        if (enabled) setValue("shipping", { zip: "", windows: [["9", "17"]] });
        else unregister("shipping");
      }} />Specify delivery details</label>
      {shippingEnabled && <fieldset>
        <legend>Delivery address and time window</legend>
        <p className="hint" id="shipping-window-hint">Same-day delivery only. Use whole hours from 0 to 23; the end must be later than the start.</p>
        <label htmlFor="shipping-zip">Postal code</label>
        <input id="shipping-zip" {...register("shipping.zip")} aria-invalid={!!errors.shipping?.zip}
          aria-describedby={errors.shipping?.zip ? "shipping-zip-error" : undefined} />
        {errors.shipping?.zip && <p id="shipping-zip-error" role="alert">{errors.shipping.zip.message}</p>}
        <div className="row">{[0, 1].map(index => <div key={index}>
          <label htmlFor={`shipping-hour-${index}`}>{index === 0 ? "Start time" : "End time"}</label>
          <input id={`shipping-hour-${index}`} type="number" {...register(`shipping.windows.0.${index}` as const)}
            min="0" max="23" step="1"
            aria-invalid={!!errors.shipping?.windows?.[0]?.[index] || !!windowError}
            aria-describedby={`shipping-window-hint${errors.shipping?.windows?.[0]?.[index] ? ` shipping-hour-${index}-error` : ""}${windowError ? " shipping-window-error" : ""}`} />
          {errors.shipping?.windows?.[0]?.[index] && <p id={`shipping-hour-${index}-error`} role="alert">
            {errors.shipping.windows[0]?.[index]?.message}
          </p>}
        </div>)}</div>
        {windowError && <p id="shipping-window-error" role="alert">{windowError}</p>}
      </fieldset>}
      <div className="section-title"><h2>Item</h2><span>{fields.length} / 3 rows</span></div>
      <p className="hint">Use 1–3 rows. Each item needs a name and an integer quantity from 1 to 99.</p>
      {fields.map((field, index) => <fieldset key={field.id} data-testid="item-row">
        <legend>Item {index + 1}</legend>
        <div className="row">
          <div>
            <label htmlFor={`${field.id}-name`}>Item name {index + 1}</label>
            <input id={`${field.id}-name`} {...register(`items.${index}.name` as const)}
              aria-invalid={!!errors.items?.[index]?.name}
              aria-describedby={errors.items?.[index]?.name ? `${field.id}-name-error` : undefined}
              placeholder="Apple" />
            {errors.items?.[index]?.name && <p id={`${field.id}-name-error`} role="alert">
              {errors.items[index]?.name?.message}
            </p>}
          </div>
          <div>
            <label htmlFor={`${field.id}-quantity`}>Quantity {index + 1}</label>
            <input id={`${field.id}-quantity`} type="number" {...register(`items.${index}.quantity` as const)}
              aria-invalid={!!errors.items?.[index]?.quantity}
              aria-describedby={errors.items?.[index]?.quantity ? `${field.id}-quantity-error` : undefined} />
            {errors.items?.[index]?.quantity && <p id={`${field.id}-quantity-error`} role="alert">
              {errors.items[index]?.quantity?.message}
            </p>}
          </div>
        </div>
        <div className="actions">
          <button type="button" className="secondary" onClick={() => remove(index)}
            aria-label={`Remove item ${index + 1}`}>Remove this row</button>
          {index > 0 && <button type="button" className="secondary" onClick={() => move(index, index - 1)}
            aria-label={`Move item ${index + 1} up`}>Move up</button>}
        </div>
      </fieldset>)}
      {arrayError && <p role="alert" data-testid="array-error">{arrayError}</p>}
      <button type="button" className="secondary" onClick={() => append({ name: "", quantity: "1" })}>Add item</button>
      <div className="actions">
        <button type="submit">Submit and validate</button>
        <button type="button" className="secondary" onClick={() => {
          setShippingEnabled(false);
          unregister("shipping");
          reset(initialValues);
          setSubmitted(null);
        }}>Reset</button>
      </div>
    </form>
    <section className="output" aria-live="polite">
      <h2>Validated data</h2>
      <p className="hint">Quantities are strings while editing. Loculus converts them to numbers on submission.</p>
      {submitted ? <pre data-testid="submitted">{JSON.stringify(submitted, null, 2)}</pre>
        : <p>No valid data submitted yet.</p>}
    </section>
    <section id="validation-schema" aria-labelledby="schema-heading">
      <h2 id="schema-heading">Validation schema</h2>
      <p className="hint">The source below is included directly from <code>examples/react-hook-form/schema.ts</code> at build time. This form uses <code>standardSchemaResolver(formSchema)</code>.</p>
      <pre data-testid="schema-source"><code>{__FORM_SCHEMA_SOURCE__}</code></pre>
    </section>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
