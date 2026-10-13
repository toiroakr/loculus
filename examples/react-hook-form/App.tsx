import { useState } from "react";
import { createRoot } from "react-dom/client";
import { useFieldArray, useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { formSchema, type FormInput, type FormOutput } from "./schema.js";

const initialValues: FormInput = { title: "", items: [{ name: "", quantity: "1" }] };

function App() {
  const [submitted, setSubmitted] = useState<FormOutput | null>(null);
  const [shippingEnabled, setShippingEnabled] = useState(false);
  const { register, control, handleSubmit, reset, setValue, unregister, formState: { errors } } = useForm<
    FormInput, undefined, FormOutput
  >({ resolver: standardSchemaResolver(formSchema), defaultValues: initialValues });
  const { fields, append, remove, move } = useFieldArray({ control, name: "items" });
  const arrayError = errors.items?.root?.message ?? errors.items?.message;

  return <main>
    <span className="eyebrow">LOCULUS × REACT HOOK FORM</span>
    <h1>明細のあるフォーム</h1>
    <p>行を追加・削除して、ネストしたエラーと送信時の型変換を試せます。</p>
    <form noValidate onSubmit={handleSubmit(data => setSubmitted(data), () => setSubmitted(null))}>
      <label htmlFor="title">注文名</label>
      <input id="title" {...register("title")} aria-invalid={!!errors.title}
        aria-describedby={errors.title ? "title-error" : undefined} placeholder="週末の買い物" />
      {errors.title && <p id="title-error" role="alert">{errors.title.message}</p>}
      <label className="toggle"><input type="checkbox" checked={shippingEnabled} onChange={event => {
        const enabled = event.target.checked;
        setShippingEnabled(enabled);
        if (enabled) setValue("shipping", { zip: "", windows: [["9", "17"]] });
        else unregister("shipping");
      }} />配送先を指定する</label>
      {shippingEnabled && <fieldset>
        <legend>配送先と時間帯</legend>
        <label htmlFor="shipping-zip">郵便番号</label>
        <input id="shipping-zip" {...register("shipping.zip")} aria-invalid={!!errors.shipping?.zip}
          aria-describedby={errors.shipping?.zip ? "shipping-zip-error" : undefined} />
        {errors.shipping?.zip && <p id="shipping-zip-error" role="alert">{errors.shipping.zip.message}</p>}
        <div className="row">{[0, 1].map(index => <div key={index}>
          <label htmlFor={`shipping-hour-${index}`}>{index === 0 ? "開始時刻" : "終了時刻"}</label>
          <input id={`shipping-hour-${index}`} type="number" {...register(`shipping.windows.0.${index}` as const)}
            aria-invalid={!!errors.shipping?.windows?.[0]?.[index]}
            aria-describedby={errors.shipping?.windows?.[0]?.[index] ? `shipping-hour-${index}-error` : undefined} />
          {errors.shipping?.windows?.[0]?.[index] && <p id={`shipping-hour-${index}-error`} role="alert">
            {errors.shipping.windows[0]?.[index]?.message}
          </p>}
        </div>)}</div>
      </fieldset>}
      <div className="section-title"><h2>商品</h2><span>{fields.length} / 3 行</span></div>
      <p className="hint">1〜3行。商品名は必須、数量は1〜99の整数です。</p>
      {fields.map((field, index) => <fieldset key={field.id} data-testid="item-row">
        <legend>商品 {index + 1}</legend>
        <div className="row">
          <div>
            <label htmlFor={`${field.id}-name`}>商品名 {index + 1}</label>
            <input id={`${field.id}-name`} {...register(`items.${index}.name` as const)}
              aria-invalid={!!errors.items?.[index]?.name}
              aria-describedby={errors.items?.[index]?.name ? `${field.id}-name-error` : undefined}
              placeholder="りんご" />
            {errors.items?.[index]?.name && <p id={`${field.id}-name-error`} role="alert">
              {errors.items[index]?.name?.message}
            </p>}
          </div>
          <div>
            <label htmlFor={`${field.id}-quantity`}>数量 {index + 1}</label>
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
            aria-label={`商品 ${index + 1} を削除`}>この行を削除</button>
          {index > 0 && <button type="button" className="secondary" onClick={() => move(index, index - 1)}
            aria-label={`商品 ${index + 1} を上へ移動`}>上へ移動</button>}
        </div>
      </fieldset>)}
      {arrayError && <p role="alert" data-testid="array-error">{arrayError}</p>}
      <button type="button" className="secondary" onClick={() => append({ name: "", quantity: "1" })}>商品を追加</button>
      <div className="actions">
        <button type="submit">送信して検証</button>
        <button type="button" className="secondary" onClick={() => {
          setShippingEnabled(false);
          unregister("shipping");
          reset(initialValues);
          setSubmitted(null);
        }}>リセット</button>
      </div>
    </form>
    <section className="output" aria-live="polite">
      <h2>検証後のデータ</h2>
      <p className="hint">入力中の数量は文字列です。送信時に loculus が number に変換します。</p>
      {submitted ? <pre data-testid="submitted">{JSON.stringify(submitted, null, 2)}</pre>
        : <p>まだ有効なデータを送信していません。</p>}
    </section>
    <details>
      <summary>使用するスキーマ</summary>
      <pre>{`const item = l.object({
  name: l.string({ trim: true, min: 1 }),
  quantity: l.number({ integer: true, gte: 1, lte: 99 }),
});

const form = l.object({
  title: l.string({ trim: true, min: 1 }),
  items: l.array(item, { min: 1, max: 3 }),
  shipping: l.object({
    zip: l.string({ trim: true, min: 3 }),
    windows: l.array(l.array(l.number({ integer: true, gte: 0, lte: 23 }), {
      min: 2, max: 2,
    }), { min: 1, max: 1 }),
  }, { optional: true }),
});

useForm({ resolver: standardSchemaResolver(form) });
useFieldArray({ control, name: "items" });`}</pre>
    </details>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
