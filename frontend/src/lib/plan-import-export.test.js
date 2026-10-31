import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  buildProgramExport,
  planToTabularRows,
  exportPlanToCSV,
  exportPlanToXLSX,
  parseCSVToRows,
  parseXLSXToRows,
  parseTabularToPlan,
  mergeImportedProgram,
  findExerciseByName,
  getRowValue
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

  it('resolves real-world natural exercise names from Google Sheets / Excel', () => {
    const bench = findExerciseByName('Bench Press')
    expect(bench).toBeTruthy()
    expect(bench.id).toBe('0025')

    const squat = findExerciseByName('Barbell Squat')
    expect(squat).toBeTruthy()
    expect(squat.id).toBe('0043')

    const deadlift = findExerciseByName('Deadlift')
    expect(deadlift).toBeTruthy()
    expect(deadlift.id).toBe('0032')

    const bicepCurl = findExerciseByName('Bicep Curl')
    expect(bicepCurl).toBeTruthy()
    expect(bicepCurl.id).toBe('0294')
  })

  it('parses realistic Excel workbook with Day/Exercise columns and title row', () => {
    const wb = XLSX.utils.book_new()
    const rawData = [
      ['MY 3-DAY WORKOUT SPLIT', '', '', '', ''],
      ['Day', 'Exercise', 'Sets', 'Reps', 'Weight'],
      ['Chest & Triceps', 'Bench Press', 4, 10, 80],
      ['Chest & Triceps', 'Incline Dumbbell Press', 3, 12, 30],
      ['Back & Biceps', 'Lat Pulldown', 4, 10, 65],
      ['Legs', 'Squat', 5, 5, 100]
    ]
    const ws = XLSX.utils.aoa_to_sheet(rawData)
    XLSX.utils.book_append_sheet(wb, ws, 'Workouts')
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })

    const parsedRows = parseXLSXToRows(new Uint8Array(buffer))
    expect(parsedRows.length).toBe(4)

    const plan = parseTabularToPlan(parsedRows, 'kg')
    expect(plan.routines.length).toBe(3)
    const chest = plan.routines.find(r => r.name === 'Chest & Triceps')
    expect(chest).toBeTruthy()
    expect(chest.ex.length).toBe(2)
    expect(chest.ex[0].id).toBe('0025') // Bench Press
    expect(chest.ex[0].weight).toBe(80)
  })

  it('parses multi-sheet Excel workbook where sheets represent routines', () => {
    const wb = XLSX.utils.book_new()
    const pushData = [
      ['Exercise', 'Sets', 'Reps', 'Weight (kg)', 'Rest'],
      ['Bench Press', 4, 8, 85, 120],
      ['Overhead Press', 3, 10, 50, 90]
    ]
    const pullData = [
      ['Exercise', 'Sets', 'Reps', 'Weight (kg)', 'Rest'],
      ['Deadlift', 3, 5, 140, 180],
      ['Lat Pulldown', 4, 12, 60, 90]
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pushData), 'Push Routine')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pullData), 'Pull Routine')
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })

    const parsedRows = parseXLSXToRows(new Uint8Array(buffer))
    expect(parsedRows.length).toBe(4)

    const plan = parseTabularToPlan(parsedRows, 'kg')
    expect(plan.routines.length).toBe(2)
    expect(plan.routines.some(r => r.name === 'Push Routine')).toBe(true)
    expect(plan.routines.some(r => r.name === 'Pull Routine')).toBe(true)
  })

  it('gracefully registers un-catalogued exercises as custom exercises without failing', () => {
    const rawData = [
      { 'Workout': 'Leg Day', 'Exercise': 'Rare Brand Belt Squat 9000', 'Sets': 4, 'Reps': 12, 'Weight': 120 }
    ]
    const plan = parseTabularToPlan(rawData, 'kg')
    expect(plan.routines.length).toBe(1)
    expect(plan.customExercises.length).toBe(1)
    expect(plan.customExercises[0].n).toBe('Rare Brand Belt Squat 9000')

    const state = { routines: [], customEx: [] }
    mergeImportedProgram(state, plan)
    expect(state.customEx.length).toBe(1)
    expect(state.customEx[0].n).toBe('Rare Brand Belt Squat 9000')
    expect(state.routines[0].ex[0].id).toBe(state.customEx[0].id)
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
