import { describe, it, expect } from 'vitest'
import {
  buildProgramExport,
  planToTabularRows,
  exportPlanToCSV,
  exportPlanToXLSX,
  parseCSVToRows,
  parseXLSXToRows,
  parseTabularToPlan,
  mergeImportedProgram
} from './plan-import-export.js'
import { ensureFolders } from './folders.js'

describe('plan-import-export module', () => {
  const sampleState = {
    unit: 'kg',
    routines: [
      {
        id: 'r_push',
        name: 'Push Day',
        emoji: 'chest',
        ex: [
          { id: '0025', sets: 4, reps: 8, weight: 80, unit: 'kg', restSec: 120 },
          { id: '0032', sets: 3, reps: 12, weight: 45, unit: 'lb', restSec: 90 }
        ]
      },
      {
        id: 'r_pull',
        name: 'Pull Day',
        emoji: 'back',
        ex: [
          { id: '0015', sets: 4, reps: 10, weight: 70, unit: 'kg', restSec: 120 }
        ]
      }
    ],
    folders: [
      {
        id: 'f_ppl',
        name: 'PPL Program',
        routineIds: ['r_push', 'r_pull'],
        collapsed: false,
        active: true
      }
    ],
    activeFolderId: 'f_ppl',
    week: { 1: ['r_push'], 3: ['r_pull'] }
  }

  it('builds full JSON program export preserving folders, routines and units', () => {
    const bundle = buildProgramExport(sampleState, 'My Hypertrophy Plan')
    expect(bundle.apex_program_version).toBe('2.0')
    expect(bundle.folders.length).toBe(1)
    expect(bundle.folders[0].name).toBe('PPL Program')
    expect(bundle.routines.length).toBe(2)
    expect(bundle.routines[0].ex[0].weight).toBe(80)
    expect(bundle.routines[0].ex[1].unit).toBe('lb')
  })

  it('generates tabular rows with folder and exercise details', () => {
    const rows = planToTabularRows(sampleState, 'My Plan')
    expect(rows.length).toBe(3)
    expect(rows[0]['Folder']).toBe('PPL Program')
    expect(rows[0]['Routine']).toBe('Push Day')
    expect(rows[0]['Exercise ID']).toBe('0025')
    expect(rows[0]['Weight']).toBe(80)
    expect(rows[0]['Unit']).toBe('kg')
    expect(rows[1]['Weight']).toBe(45)
    expect(rows[1]['Unit']).toBe('lb')
  })

  it('exports to CSV and parses back without data loss', () => {
    const csv = exportPlanToCSV(sampleState, 'My Plan')
    expect(csv).toContain('"Push Day"')
    expect(csv).toContain('"0025"')
    expect(csv).toContain('"PPL Program"')

    const parsedRows = parseCSVToRows(csv)
    expect(parsedRows.length).toBe(3)
    expect(parsedRows[0]['Routine']).toBe('Push Day')
    expect(parsedRows[0]['Exercise ID']).toBe('0025')
    expect(parsedRows[1]['Unit']).toBe('lb')
  })

  it('exports to XLSX ArrayBuffer and parses back', () => {
    const xlsxBuffer = exportPlanToXLSX(sampleState, 'My Plan')
    expect(xlsxBuffer).toBeInstanceOf(Uint8Array)

    const parsedRows = parseXLSXToRows(xlsxBuffer)
    expect(parsedRows.length).toBe(3)
    expect(parsedRows[0]['Routine']).toBe('Push Day')
    expect(parsedRows[0]['Exercise ID']).toBe('0025')
    expect(parsedRows[1]['Weight']).toBe(45)
  })

  it('converts parsed tabular rows into validated folders and routines', () => {
    const csv = exportPlanToCSV(sampleState, 'My Plan')
    const rows = parseCSVToRows(csv)
    const plan = parseTabularToPlan(rows, 'kg')

    expect(plan.routines.length).toBe(2)
    expect(plan.folders.length).toBe(1)
    expect(plan.folders[0].name).toBe('PPL Program')
    expect(plan.routines[0].ex.length).toBe(2)
    expect(plan.routines[0].ex[1].unit).toBe('lb')
  })

  it('merges imported program with duplicate resolution: copy', () => {
    const state = JSON.parse(JSON.stringify(sampleState))
    const imported = {
      routines: [
        {
          id: 'imp_1',
          name: 'Push Day',
          ex: [{ id: '0025', sets: 5, reps: 5, weight: 100, unit: 'kg' }]
        }
      ],
      folders: [
        { id: 'imp_f', name: 'New PPL', routineIds: ['imp_1'] }
      ]
    }

    mergeImportedProgram(state, imported, { duplicateStrategy: 'copy' })
    expect(state.routines.length).toBe(3)
    expect(state.routines.some(r => r.name === 'Push Day (Imported)')).toBe(true)
    expect(state.folders.some(f => f.name === 'New PPL')).toBe(true)
  })

  it('merges imported program with duplicate resolution: replace', () => {
    const state = JSON.parse(JSON.stringify(sampleState))
    const imported = {
      routines: [
        {
          id: 'imp_1',
          name: 'Push Day',
          ex: [{ id: '0025', sets: 5, reps: 5, weight: 100, unit: 'kg' }]
        }
      ]
    }

    mergeImportedProgram(state, imported, { duplicateStrategy: 'replace' })
    expect(state.routines.length).toBe(2)
    const push = state.routines.find(r => r.name === 'Push Day')
    expect(push.ex[0].sets).toBe(5)
    expect(push.ex[0].weight).toBe(100)
  })

  it('merges imported program with duplicate resolution: skip', () => {
    const state = JSON.parse(JSON.stringify(sampleState))
    const imported = {
      routines: [
        {
          id: 'imp_1',
          name: 'Push Day',
          ex: [{ id: '0025', sets: 5, reps: 5, weight: 100, unit: 'kg' }]
        }
      ]
    }

    mergeImportedProgram(state, imported, { duplicateStrategy: 'skip' })
    expect(state.routines.length).toBe(2)
    const push = state.routines.find(r => r.name === 'Push Day')
    expect(push.ex[0].sets).toBe(4) // Unchanged
  })
})
