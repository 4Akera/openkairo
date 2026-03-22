import { useState } from 'react'
import type { BlockDefinition, FieldDef } from '../../types'
import { Input } from '../ui'
import { cn } from '../../lib/utils'

// ============================================================
// Field-level view component
// ============================================================

function FieldView({ field, value }: { field: FieldDef; value: unknown }) {
  if (field.type === 'section_header') {
    return (
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mt-3 mb-1">
        {field.label}
      </p>
    )
  }

  const isEmpty = value === null || value === undefined || value === ''
  if (isEmpty) return null

  if (field.type === 'checkbox') {
    return (
      <div className="flex items-center gap-1.5 text-sm">
        <span className={cn('w-2 h-2 rounded-full', value ? 'bg-green-500' : 'bg-slate-300')} />
        <span className="text-muted-foreground">{field.label}:</span>
        <span>{value ? 'Yes' : 'No'}</span>
      </div>
    )
  }

  if (field.type === 'multiselect' && Array.isArray(value)) {
    return (
      <div className="text-sm space-y-0.5">
        <span className="text-muted-foreground text-xs">{field.label}:</span>
        <div className="flex flex-wrap gap-1">
          {(value as string[]).map((v) => {
            const opt = field.options?.find((o) => o.value === v)
            return (
              <span key={v} className="px-1.5 py-0.5 rounded text-xs bg-muted border">
                {opt?.label ?? v}
              </span>
            )
          })}
        </div>
      </div>
    )
  }

  if (field.type === 'select') {
    const opt = field.options?.find((o) => o.value === String(value))
    return (
      <div className="text-sm">
        <span className="text-muted-foreground text-xs">{field.label}: </span>
        <span>{opt?.label ?? String(value)}</span>
      </div>
    )
  }

  return (
    <div className="text-sm">
      <span className="text-muted-foreground text-xs">{field.label}: </span>
      <span>
        {String(value)}
        {field.unit ? ` ${field.unit}` : ''}
      </span>
    </div>
  )
}

// ============================================================
// Field-level edit component
// ============================================================

function FieldEdit({
  field,
  value,
  onChange,
  content,
}: {
  field: FieldDef
  value: unknown
  onChange: (v: unknown) => void
  content: Record<string, unknown>
}) {
  // Conditional visibility
  if (field.show_if) {
    const target = content[field.show_if.field]
    const visible = (() => {
      switch (field.show_if!.operator) {
        case 'eq':  return target === field.show_if!.value
        case 'neq': return target !== field.show_if!.value
        case 'gt':  return Number(target) > Number(field.show_if!.value)
        case 'lt':  return Number(target) < Number(field.show_if!.value)
        default:    return true
      }
    })()
    if (!visible) return null
  }

  if (field.type === 'section_header') {
    return (
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mt-4 mb-1 col-span-2">
        {field.label}
      </p>
    )
  }

  const label = (
    <label className="block text-xs text-muted-foreground mb-1">
      {field.label}
      {field.required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  )

  if (field.type === 'checkbox') {
    return (
      <div className="flex items-center gap-2 py-1">
        <input
          type="checkbox"
          id={field.id}
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 rounded border-border accent-primary"
        />
        <label htmlFor={field.id} className="text-sm cursor-pointer">
          {field.label}
        </label>
      </div>
    )
  }

  if (field.type === 'textarea') {
    return (
      <div>
        {label}
        <textarea
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={field.rows ?? 3}
          className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background resize-y focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    )
  }

  if (field.type === 'number') {
    return (
      <div>
        {label}
        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            placeholder={field.placeholder}
            min={field.min}
            max={field.max}
            className="text-sm"
          />
          {field.unit && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">{field.unit}</span>
          )}
        </div>
      </div>
    )
  }

  if (field.type === 'select') {
    return (
      <div>
        {label}
        <select
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Select…</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    )
  }

  if (field.type === 'multiselect') {
    const selected: string[] = Array.isArray(value) ? (value as string[]) : []
    const toggle = (v: string) => {
      const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]
      onChange(next)
    }
    return (
      <div>
        {label}
        <div className="flex flex-wrap gap-1.5">
          {field.options?.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className={cn(
                'px-2 py-1 rounded text-xs border transition-colors',
                selected.includes(o.value)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border hover:border-primary/50',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (field.type === 'date') {
    return (
      <div>
        {label}
        <Input
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm"
        />
      </div>
    )
  }

  if (field.type === 'datetime') {
    return (
      <div>
        {label}
        <Input
          type="datetime-local"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm"
        />
      </div>
    )
  }

  // Default: text
  return (
    <div>
      {label}
      <Input
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="text-sm"
      />
    </div>
  )
}

// ============================================================
// Score computation
// ============================================================

function computeScore(
  definition: BlockDefinition,
  content: Record<string, unknown>,
): number | null {
  const cfg = definition.config.score
  if (!cfg) return null
  return cfg.fields.reduce((sum, fid) => sum + (Number(content[fid]) || 0), 0)
}

// ============================================================
// Public: DynamicBlockView
// ============================================================

export function DynamicBlockView({
  definition,
  content,
}: {
  definition: BlockDefinition
  content: Record<string, unknown>
}) {
  const score = computeScore(definition, content)
  const scoreConfig = definition.config.score

  return (
    <div className="space-y-1.5 px-1">
      {definition.fields.map((field) => (
        <FieldView key={field.id} field={field} value={content[field.id]} />
      ))}

      {score !== null && scoreConfig && (
        <div className="mt-3 p-2 rounded bg-muted/50 border border-border/50 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{scoreConfig.label}:</span>
          <span className="text-sm font-bold">{score}</span>
          {(() => {
            const interp = scoreConfig.interpretation?.find(
              (i) => score >= i.min && score <= i.max,
            )
            return interp ? (
              <span className={cn('text-xs px-1.5 py-0.5 rounded border', interp.color)}>
                {interp.label}
              </span>
            ) : null
          })()}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Public: DynamicBlockEdit
// ============================================================

export function DynamicBlockEdit({
  definition,
  content,
  onChange,
}: {
  definition: BlockDefinition
  content: Record<string, unknown>
  onChange: (content: Record<string, unknown>) => void
}) {
  const setField = (id: string, val: unknown) => onChange({ ...content, [id]: val })

  const score = computeScore(definition, content)
  const scoreConfig = definition.config.score

  return (
    <div className="space-y-3 px-1">
      {definition.fields.map((field) => (
        <FieldEdit
          key={field.id}
          field={field}
          value={content[field.id]}
          onChange={(v) => setField(field.id, v)}
          content={content}
        />
      ))}

      {score !== null && scoreConfig && (
        <div className="mt-2 p-2 rounded bg-muted/50 border border-border/50 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{scoreConfig.label}:</span>
          <span className="text-sm font-bold">{score}</span>
          {(() => {
            const interp = scoreConfig.interpretation?.find(
              (i) => score >= i.min && score <= i.max,
            )
            return interp ? (
              <span className={cn('text-xs px-1.5 py-0.5 rounded border', interp.color)}>
                {interp.label}
              </span>
            ) : null
          })()}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Hook: empty content initializer
// ============================================================

export function useEmptyDynamicContent(definition: BlockDefinition): Record<string, unknown> {
  const [initial] = useState(() => {
    const content: Record<string, unknown> = {}
    definition.fields.forEach((f) => {
      if (f.type === 'checkbox') content[f.id] = false
      else if (f.type === 'multiselect') content[f.id] = []
      else if (f.type !== 'section_header') content[f.id] = ''
    })
    return content
  })
  return initial
}
