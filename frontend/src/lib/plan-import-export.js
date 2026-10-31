import * as XLSX from 'xlsx'
import { EXIDX, CATALOGUE, isBodyweightEq } from './exercises.js'
import { uid, todayISO } from './format.js'
import { normUnit } from './units.js'
import { ensureFolders } from './folders.js'
import { buildPlanBundle, parsePlan } from './plan-share.js'

export function findExerciseByName(name) {
  if (!name || typeof name !== 'string') return null
  const q = name.trim().toLowerCase()
  return CATALOGUE.find(e => (e.name || '').toLowerCase() === q) || null
}

/**
 * Clean and normalize a routine exercise for export/import, preserving units.
 */
export function cleanRoutineExercise(e) {
  if (!e || typeof e !== 'object') return e
  const out = { id: e.id, sets: Number(e.sets) || 3 }
  if (e.reps != null) out.reps = Number(e.reps) || 10
  if (e.weight != null) out.weight = Number(e.weight) || 0
  if (e.unit) out.unit = normUnit(e.unit)
  if (e.restSec != null) out.restSec = Number(e.restSec) || 90
  if (e.warmupRestSec != null) out.warmupRestSec = Number(e.warmupRestSec) || 60
  if (e.mode) out.mode = e.mode
  if (e.bodyweight != null) out.bodyweight = !!e.bodyweight
  if (e.side) out.side = !!e.side
  if (e.prog) out.prog = e.prog
  if (e.inc > 0) out.inc = e.inc
  if (e.lastToFailure) out.lastToFailure = true
  if (e.intensifier) out.intensifier = e.intensifier
  if (Array.isArray(e.pyramid)) out.pyramid = e.pyramid
  if (Array.isArray(e.pyramidRest)) out.pyramidRest = e.pyramidRest
  if (Array.isArray(e.pyramidWeight)) out.pyramidWeight = e.pyramidWeight
  if (e.note) out.note = e.note
  return out
}

/**
 * Builds a comprehensive program export object containing folders, routines, and exercises.
 */
export function buildProgramExport(S, programName = '') {
  const safeS = ensureFolders(S)
  const baseBundle = buildPlanBundle(safeS, programName || 'APEX Workout Programs')

  const routines = (safeS.routines || []).map(r => ({
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    ...(r.prog ? { prog: r.prog } : {}),
    ex: (r.ex || []).map(cleanRoutineExercise)
  }))

  return {
    ...baseBundle,
    apex_program_version: '2.0',
    activeFolderId: safeS.activeFolderId,
    routines,
    folders: (safeS.folders || []).map(f => ({
      id: f.id,
      name: f.name,
      routineIds: Array.isArray(f.routineIds) ? [...f.routineIds] : [],
      collapsed: !!f.collapsed,
      active: f.id === safeS.activeFolderId,
      _ts: f._ts || Date.now()
    }))
  }
}

/**
 * Converts routines and folders into a flat row array suitable for CSV and XLSX export.
 */
export function planToTabularRows(S, programName = 'APEX Fitness Plan') {
  const safeS = ensureFolders(S)
  const rows = []
  const folderMap = new Map((safeS.folders || []).map(f => [f.id, f]))

  // Find which folder owns each routine
  const routineToFolder = new Map()
  ;(safeS.folders || []).forEach(f => {
    (f.routineIds || []).forEach(rId => routineToFolder.set(rId, f.name))
  })

  const routines = safeS.routines || []
  routines.forEach(r => {
    const folderName = routineToFolder.get(r.id) || 'General'
    const exercises = r.ex || []
    if (exercises.length === 0) {
      rows.push({
        'Program': programName,
        'Folder': folderName,
        'Routine': r.name,
        'Exercise Name': '',
        'Exercise ID': '',
        'Sets': 0,
        'Reps': 0,
        'Weight': 0,
        'Unit': S.unit || 'kg',
        'Rest (s)': 90,
        'Warmup Sets': 0,
        'Notes': ''
      })
      return
    }

    exercises.forEach(e => {
      const meta = EXIDX[e.id] || {}
      const exName = e.name || meta.name || e.id
      rows.push({
        'Program': programName,
        'Folder': folderName,
        'Routine': r.name,
        'Exercise Name': exName,
        'Exercise ID': e.id,
        'Sets': Number(e.sets) || 3,
        'Reps': Number(e.reps) || 10,
        'Weight': Number(e.weight) || 0,
        'Unit': normUnit(e.unit || S.unit || 'kg'),
        'Rest (s)': Number(e.restSec) || 90,
        'Warmup Sets': Array.isArray(e.warmup) ? e.warmup.length : (Number(e.warmupSets) || 0),
        'Notes': e.note || ''
      })
    })
  })

  return rows
}

/**
 * Generate CSV string from plan state.
 */
export function exportPlanToCSV(S, programName = 'APEX Fitness Plan') {
  const rows = planToTabularRows(S, programName)
  if (rows.length === 0) return ''

  const headers = Object.keys(rows[0])
  const escapeCsv = val => {
    if (val == null) return '""'
    const s = String(val).replace(/"/g, '""')
    return `"${s}"`
  }

  const csvLines = [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => headers.map(h => escapeCsv(row[h])).join(','))
  ]

  return csvLines.join('\n')
}

/**
 * Generate an XLSX workbook ArrayBuffer from plan state.
 */
export function exportPlanToXLSX(S, programName = 'APEX Fitness Plan') {
  const rows = planToTabularRows(S, programName)
  const safeS = ensureFolders(S)

  const wb = XLSX.utils.book_new()
  const wsRoutines = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, wsRoutines, 'Routines & Exercises')

  const folderRows = (safeS.folders || []).map(f => ({
    'Folder ID': f.id,
    'Folder Name': f.name,
    'Active Program': f.id === safeS.activeFolderId ? 'YES' : 'NO',
    'Routine Count': (f.routineIds || []).length
  }))
  const wsFolders = XLSX.utils.json_to_sheet(folderRows)
  XLSX.utils.book_append_sheet(wb, wsFolders, 'Program Folders')

  return new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }))
}

/**
 * Parses CSV text into normalized rows.
 */
export function parseCSVToRows(csvText) {
  if (!csvText || typeof csvText !== 'string') return []
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0)
  if (lines.length < 2) return []

  const parseLine = line => {
    const entries = []
    let cur = ''
    let insideQuotes = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          insideQuotes = !insideQuotes
        }
      } else if (c === ',' && !insideQuotes) {
        entries.push(cur.trim())
        cur = ''
      } else {
        cur += c
      }
    }
    entries.push(cur.trim())
    return entries
  }

  const headers = parseLine(lines[0])
  return lines.slice(1).map(line => {
    const cells = parseLine(line)
    const obj = {}
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] != null ? cells[idx] : ''
    })
    return obj
  })
}

/**
 * Parses XLSX data (ArrayBuffer or binary string) into tabular rows.
 */
export function parseXLSXToRows(data) {
  const wb = XLSX.read(data, { type: typeof data === 'string' ? 'binary' : 'array' })
  const firstSheetName = wb.SheetNames[0]
  if (!firstSheetName) return []
  const sheet = wb.Sheets[firstSheetName]
  return XLSX.utils.sheet_to_json(sheet)
}

/**
 * Validates and converts tabular rows (from CSV or XLSX) into structured folders and routines.
 */
export function parseTabularToPlan(rows, defaultUnit = 'kg') {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('No data found in file')
  }

  const folderMap = new Map()
  const routineMap = new Map()
  const errors = []
  let rowNum = 1

  rows.forEach(row => {
    rowNum++
    const routineName = (row['Routine'] || row['routine'] || '').trim()
    if (!routineName) return

    const folderName = (row['Folder'] || row['folder'] || 'Imported Program').trim()
    const exId = (row['Exercise ID'] || row['exercise id'] || row['id'] || '').trim()
    const exName = (row['Exercise Name'] || row['exercise name'] || row['Exercise'] || '').trim()
    const sets = Math.max(1, parseInt(row['Sets'] || row['sets'] || '3', 10) || 3)
    const reps = Math.max(1, parseInt(row['Reps'] || row['reps'] || '10', 10) || 10)
    const weight = Math.max(0, parseFloat(row['Weight'] || row['weight'] || '0') || 0)
    const unit = normUnit(row['Unit'] || row['unit'] || defaultUnit)
    const restSec = Math.max(0, parseInt(row['Rest (s)'] || row['rest'] || '90', 10) || 90)

    // Resolve exercise ID
    let resolvedId = exId
    if (!resolvedId && exName) {
      const match = findExerciseByName(exName)
      if (match) resolvedId = match.id
    }

    if (!resolvedId || !EXIDX[resolvedId]) {
      // If cannot resolve, skip with warning
      errors.push(`Row ${rowNum}: Exercise "${exName || exId}" not recognized in library`)
      return
    }

    // Register folder
    if (!folderMap.has(folderName)) {
      folderMap.set(folderName, {
        id: 'f_' + uid(),
        name: folderName,
        routineIds: []
      })
    }

    // Register routine
    const routineKey = `${folderName}:::${routineName}`
    if (!routineMap.has(routineKey)) {
      const rId = uid()
      const newRoutine = {
        id: rId,
        name: routineName,
        emoji: null,
        ex: []
      }
      routineMap.set(routineKey, newRoutine)
      folderMap.get(folderName).routineIds.push(rId)
    }

    const r = routineMap.get(routineKey)
    r.ex.push({
      id: resolvedId,
      sets,
      reps,
      weight,
      unit,
      restSec
    })
  })

  const folders = Array.from(folderMap.values())
  const routines = Array.from(routineMap.values())

  if (routines.length === 0) {
    throw new Error('No valid routines or recognized exercises found in file')
  }

  return {
    folders,
    routines,
    errors,
    routineCount: routines.length,
    exerciseCount: routines.reduce((n, r) => n + r.ex.length, 0)
  }
}

/**
 * Merges imported plan/program into state with configurable duplicate resolution.
 * duplicateStrategy: 'copy' (create distinct copy), 'replace' (overwrite existing), 'skip' (keep current)
 */
export function mergeImportedProgram(s, imported, { duplicateStrategy = 'copy', schedule = false } = {}) {
  const safeS = ensureFolders(s)
  s.folders = safeS.folders
  s.activeFolderId = safeS.activeFolderId
  s.routines = s.routines || []

  const existingRoutineByName = new Map(s.routines.map(r => [r.name.toLowerCase().trim(), r]))
  const existingFolderByName = new Map(s.folders.map(f => [f.name.toLowerCase().trim(), f]))
  const oldToNewRoutineId = new Map()

  const importedRoutines = Array.isArray(imported.routines) ? imported.routines : []
  const importedFolders = Array.isArray(imported.folders) ? imported.folders : []

  importedRoutines.forEach(impR => {
    const key = impR.name.toLowerCase().trim()
    const existing = existingRoutineByName.get(key)

    if (existing) {
      if (duplicateStrategy === 'skip') {
        oldToNewRoutineId.set(impR.id, existing.id)
        return
      }
      if (duplicateStrategy === 'replace') {
        existing.ex = (impR.ex || []).map(cleanRoutineExercise)
        existing.emoji = impR.emoji || existing.emoji
        existing._ts = Date.now()
        oldToNewRoutineId.set(impR.id, existing.id)
        return
      }
      // 'copy' strategy:
      const copyId = uid()
      const copyRoutine = {
        ...impR,
        id: copyId,
        name: `${impR.name} (Imported)`,
        ex: (impR.ex || []).map(cleanRoutineExercise),
        _ts: Date.now()
      }
      s.routines.push(copyRoutine)
      oldToNewRoutineId.set(impR.id, copyId)
      return
    }

    // New routine
    const newRoutine = {
      ...impR,
      id: impR.id || uid(),
      ex: (impR.ex || []).map(cleanRoutineExercise),
      _ts: Date.now()
    }
    s.routines.push(newRoutine)
    oldToNewRoutineId.set(impR.id, newRoutine.id)
  })

  // Merge folders
  if (importedFolders.length > 0) {
    importedFolders.forEach(impF => {
      const mappedRoutineIds = (impF.routineIds || [])
        .map(id => oldToNewRoutineId.get(id))
        .filter(Boolean)

      const fKey = impF.name.toLowerCase().trim()
      const existingF = existingFolderByName.get(fKey)

      if (existingF) {
        mappedRoutineIds.forEach(rId => {
          if (!existingF.routineIds.includes(rId)) {
            existingF.routineIds.push(rId)
          }
        })
        existingF._ts = Date.now()
      } else {
        const newFolder = {
          id: 'f_' + uid(),
          name: impF.name,
          routineIds: mappedRoutineIds,
          collapsed: false,
          _ts: Date.now()
        }
        s.folders.push(newFolder)
      }
    })
  } else {
    // If no folders in imported file, add imported routines to the active folder
    const targetFolder = s.folders.find(f => f.id === s.activeFolderId) || s.folders[0]
    if (targetFolder) {
      oldToNewRoutineId.forEach(newId => {
        if (!targetFolder.routineIds.includes(newId)) {
          targetFolder.routineIds.push(newId)
        }
      })
    }
  }

  // Handle schedule if requested
  if (schedule && imported.week && typeof imported.week === 'object') {
    Object.entries(imported.week).forEach(([day, rIds]) => {
      const mapped = [].concat(rIds)
        .map(id => oldToNewRoutineId.get(id) || id)
        .filter(id => s.routines.some(r => r.id === id))
      if (mapped.length > 0) {
        s.week[day] = mapped
      }
    })
  }

  ensureFolders(s)
  return s
}
