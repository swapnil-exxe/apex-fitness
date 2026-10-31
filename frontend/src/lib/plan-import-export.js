import * as XLSX from 'xlsx'
import { EXIDX, CATALOGUE, isBodyweightEq } from './exercises.js'
import { uid, todayISO } from './format.js'
import { normUnit } from './units.js'
import { ensureFolders } from './folders.js'
import { buildPlanBundle, parsePlan } from './plan-share.js'
import { matchExercise, matchHevyTitle } from './import-csv.js'

/**
 * Normalizes and extracts cell values by inspecting candidate column names in priority order,
 * case-insensitively and stripping whitespace / special characters.
 */
export function getRowValue(row, ...candidateKeys) {
  if (!row || typeof row !== 'object') return ''
  const rowEntries = Object.entries(row).map(([k, v]) => [k.toLowerCase().replace(/[^a-z0-9]/g, ''), v])
  for (const targetKey of candidateKeys) {
    const cleanTarget = targetKey.toLowerCase().replace(/[^a-z0-9]/g, '')
    const hit = rowEntries.find(([k, v]) => k === cleanTarget && v !== undefined && v !== null && String(v).trim() !== '')
    if (hit) return String(hit[1]).trim()
  }
  return ''
}

/**
 * Provides a clean sample workout plan template that users can export, edit in Excel/Google Sheets,
 * and re-import directly into APEX Fitness.
 */
export function getSamplePlanTemplate() {
  return {
    unit: 'kg',
    routines: [
      {
        id: 'r_push_sample',
        name: 'Push Day',
        emoji: 'chest',
        ex: [
          { id: '0025', sets: 4, reps: 8, weight: 80, unit: 'kg', restSec: 120 },
          { id: '0070', sets: 3, reps: 10, weight: 50, unit: 'kg', restSec: 90 },
          { id: '0241', sets: 3, reps: 12, weight: 30, unit: 'kg', restSec: 60 }
        ]
      },
      {
        id: 'r_pull_sample',
        name: 'Pull Day',
        emoji: 'back',
        ex: [
          { id: '0032', sets: 3, reps: 5, weight: 120, unit: 'kg', restSec: 180 },
          { id: '2330', sets: 4, reps: 10, weight: 65, unit: 'kg', restSec: 90 },
          { id: '0294', sets: 3, reps: 12, weight: 16, unit: 'kg', restSec: 60 }
        ]
      },
      {
        id: 'r_legs_sample',
        name: 'Legs Day',
        emoji: 'legs',
        ex: [
          { id: '0043', sets: 4, reps: 8, weight: 100, unit: 'kg', restSec: 150 },
          { id: '0739', sets: 3, reps: 12, weight: 180, unit: 'kg', restSec: 90 },
          { id: '0585', sets: 3, reps: 15, weight: 50, unit: 'kg', restSec: 60 }
        ]
      }
    ],
    folders: [
      {
        id: 'f_ppl_sample',
        name: 'Sample 3-Day Program',
        routineIds: ['r_push_sample', 'r_pull_sample', 'r_legs_sample'],
        collapsed: false,
        active: true
      }
    ],
    activeFolderId: 'f_ppl_sample'
  }
}

/**
 * Searches the exercise catalogue and custom exercises using fuzzy matching,
 * Hevy title resolution, token matching, and exact name matching.
 */
export function findExerciseByName(name, customEx = []) {
  if (!name || typeof name !== 'string') return null
  const clean = name.trim()
  if (!clean) return null

  // 1. Direct ID check
  if (EXIDX[clean]) return EXIDX[clean]
  const customHit = (customEx || []).find(c => c && c.id === clean)
  if (customHit) return customHit

  // 2. High-precision fuzzy matcher from import-csv (word-bags, aliases, equipment qualifiers)
  const matchedId = matchExercise(clean)
  if (matchedId && EXIDX[matchedId]) return EXIDX[matchedId]

  // 3. Hevy title map
  const hevyId = matchHevyTitle(clean)
  if (hevyId && EXIDX[hevyId]) return EXIDX[hevyId]

  // 4. Exact lowercase match against catalogue (`.n` and `.name`)
  const q = clean.toLowerCase()
  const exact = CATALOGUE.find(e => (e.n || e.name || '').toLowerCase() === q)
  if (exact) return exact

  // 5. Check custom exercises by name
  const existingCustom = (customEx || []).find(c => (c.n || c.name || '').toLowerCase() === q)
  if (existingCustom) return existingCustom

  // 6. Token containment: all significant words match
  const words = q.split(/[\s,()\-+/]+/).filter(w => w.length > 2)
  if (words.length > 0) {
    const allWords = CATALOGUE.find(e => {
      const en = (e.n || e.name || '').toLowerCase()
      return words.every(w => en.includes(w))
    })
    if (allWords) return allWords

    // Fallback: majority of words match
    let best = null, maxMatches = 0
    for (const e of CATALOGUE) {
      const en = (e.n || e.name || '').toLowerCase()
      const matchCount = words.filter(w => en.includes(w)).length
      if (matchCount > maxMatches && matchCount >= Math.ceil(words.length * 0.6)) {
        maxMatches = matchCount
        best = e
      }
    }
    if (best) return best
  }

  return null
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
    })),
    customExercises: (safeS.customEx || []).filter(c => c && c.id)
  }
}

/**
 * Converts routines and folders into a flat row array suitable for CSV and XLSX export.
 */
export function planToTabularRows(S, programName = 'APEX Fitness Plan') {
  const safeS = ensureFolders(S)
  const rows = []

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
      const meta = EXIDX[e.id] || (safeS.customEx || []).find(c => c.id === e.id) || {}
      const exName = e.name || meta.n || meta.name || e.id
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
 * Generate an XLSX workbook Uint8Array from plan state.
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
 * Parses CSV text into normalized rows, skipping any preamble/title lines.
 */
export function parseCSVToRows(csvText) {
  if (!csvText || typeof csvText !== 'string') return []
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0)
  if (lines.length === 0) return []

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

  // Detect true header line (first line containing at least 2 fitness column keywords)
  let headerLineIdx = 0
  const headerKeywords = ['exercise', 'routine', 'workout', 'day', 'set', 'rep', 'weight', 'rest', 'lift', 'movement', 'name']
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const parsed = parseLine(lines[i])
    const matchCount = parsed.filter(cell => {
      const s = String(cell || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
      return s.length > 0 && s.length <= 25 && headerKeywords.some(kw => s === kw || s.startsWith(kw) || s.endsWith(kw))
    }).length
    if (matchCount >= 2) {
      headerLineIdx = i
      break
    }
  }

  const headers = parseLine(lines[headerLineIdx])
  return lines.slice(headerLineIdx + 1).map(line => {
    const cells = parseLine(line)
    const obj = {}
    headers.forEach((h, idx) => {
      if (h) obj[h] = cells[idx] != null ? cells[idx] : ''
    })
    return obj
  }).filter(obj => Object.values(obj).some(v => v !== ''))
}

/**
 * Parses XLSX data (ArrayBuffer, Uint8Array or binary string) into tabular rows.
 * Reads across all workout sheets and tolerates leading title rows.
 */
export function parseXLSXToRows(data) {
  const wb = XLSX.read(data, { type: typeof data === 'string' ? 'binary' : 'array' })
  const allRows = []

  for (const sheetName of wb.SheetNames) {
    const cleanSheetName = sheetName.trim()
    // Skip sheets that are metadata or non-routine info
    if (/^(program folders|instructions|readme|legend|notes)$/i.test(cleanSheetName)) {
      continue
    }

    const sheet = wb.Sheets[sheetName]
    if (!sheet) continue

    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    if (!Array.isArray(rawData) || rawData.length === 0) continue

    // Detect header row index (first row containing at least 2 column keywords)
    let headerRowIdx = 0
    const headerKeywords = ['exercise', 'routine', 'workout', 'day', 'set', 'rep', 'weight', 'rest', 'lift', 'movement', 'name']
    for (let i = 0; i < Math.min(rawData.length, 10); i++) {
      const row = rawData[i]
      if (!Array.isArray(row)) continue
      const matchCount = row.filter(cell => {
        const s = String(cell || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
        return s.length > 0 && s.length <= 25 && headerKeywords.some(kw => s === kw || s.startsWith(kw) || s.endsWith(kw))
      }).length
      if (matchCount >= 2) {
        headerRowIdx = i
        break
      }
    }

    const headers = (rawData[headerRowIdx] || []).map(h => String(h || '').trim())
    const dataRows = rawData.slice(headerRowIdx + 1)

    dataRows.forEach(rowCells => {
      if (!Array.isArray(rowCells) || rowCells.every(c => c === '' || c == null)) return
      const rowObj = {}
      headers.forEach((h, colIdx) => {
        if (h) rowObj[h] = rowCells[colIdx] != null ? rowCells[colIdx] : ''
      })

      // If the row doesn't have an explicit Routine / Day column, default to the Sheet name!
      const hasRoutine = getRowValue(rowObj, 'Routine', 'Routine Name', 'Workout', 'Workout Name', 'Session', 'Day')
      if (!hasRoutine && cleanSheetName !== 'Sheet1' && cleanSheetName !== 'Routines & Exercises') {
        rowObj['Routine'] = cleanSheetName
      }
      allRows.push(rowObj)
    })
  }

  if (allRows.length === 0 && wb.SheetNames.length > 0) {
    const firstSheet = wb.Sheets[wb.SheetNames[0]]
    if (firstSheet) {
      return XLSX.utils.sheet_to_json(firstSheet, { defval: '' })
    }
  }

  return allRows
}

/**
 * Validates and converts tabular rows (from CSV or XLSX) into structured folders, routines,
 * and custom exercises with maximum fault tolerance.
 */
export function parseTabularToPlan(rows, defaultUnit = 'kg', customEx = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('No data found in file')
  }

  const folderMap = new Map()
  const routineMap = new Map()
  const createdCustoms = []
  const knownCustoms = [...(customEx || [])]
  const errors = []

  rows.forEach(row => {
    const exName = getRowValue(row, 'Exercise Name', 'Exercise', 'Movement', 'Lift', 'Name', 'Exercise Title')
    const exId = getRowValue(row, 'Exercise ID', 'id', 'ID', 'Code')
    if (!exName && !exId) return

    let routineName = getRowValue(row, 'Routine', 'Routine Name', 'Workout', 'Workout Name', 'Session', 'Day', 'Split')
    if (!routineName) {
      routineName = 'Workout 1'
    }

    const folderName = getRowValue(row, 'Folder', 'Folder Name', 'Program', 'Program Name', 'Category') || 'Imported Program'
    const setsRaw = getRowValue(row, 'Sets', 'Set', 'Total Sets')
    const repsRaw = getRowValue(row, 'Reps', 'Rep', 'Repetitions', 'Target Reps')
    const weightRaw = getRowValue(row, 'Weight', 'Load', 'Weight kg', 'Weight lbs', 'Weight lb', 'Target Weight')
    const unitRaw = getRowValue(row, 'Unit', 'Units', 'Weight Unit')
    const restRaw = getRowValue(row, 'Rest s', 'Rest', 'Rest sec', 'Rest Time', 'Rest seconds')

    const sets = Math.max(1, parseInt(setsRaw || '3', 10) || 3)
    const reps = Math.max(1, parseInt(repsRaw || '10', 10) || 10)
    const weight = Math.max(0, parseFloat(weightRaw || '0') || 0)

    let unit = defaultUnit
    if (unitRaw) {
      unit = normUnit(unitRaw)
    } else if (/lbs?/i.test(weightRaw)) {
      unit = 'lb'
    } else if (/kg/i.test(weightRaw)) {
      unit = 'kg'
    }

    const restSec = Math.max(0, parseInt(restRaw || '90', 10) || 90)

    // Resolve exercise
    let resolvedId = exId
    if (!resolvedId && exName) {
      const match = findExerciseByName(exName, knownCustoms)
      if (match) resolvedId = match.id
    }

    if (!resolvedId || (!EXIDX[resolvedId] && !knownCustoms.some(c => c.id === resolvedId))) {
      // Graceful fallback: register as custom exercise so it is NEVER lost
      const displayName = exName || exId || 'Custom Exercise'
      const customId = 'c_' + uid()
      const newCustom = {
        id: customId,
        n: displayName,
        name: displayName,
        custom: true,
        eq: 'custom',
        tg: '',
        desc: ''
      }
      knownCustoms.push(newCustom)
      createdCustoms.push(newCustom)
      resolvedId = customId
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
    throw new Error('No workout routines or exercises could be parsed from the file')
  }

  return {
    folders,
    routines,
    customExercises: createdCustoms,
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
  s.customEx = s.customEx || []

  // Integrate any imported custom exercises into user state
  if (Array.isArray(imported.customExercises) && imported.customExercises.length > 0) {
    imported.customExercises.forEach(cx => {
      if (!cx || !cx.id) return
      const exists = s.customEx.find(c => c.id === cx.id || (c.n || '').toLowerCase() === (cx.n || '').toLowerCase())
      if (!exists) {
        s.customEx.push(cx)
      }
    })
  }

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
      // 'copy' strategy: clone with unique name
      const newId = uid()
      const newRoutine = {
        id: newId,
        name: `${impR.name} (Imported)`,
        emoji: impR.emoji || null,
        ex: (impR.ex || []).map(cleanRoutineExercise),
        _ts: Date.now()
      }
      s.routines.push(newRoutine)
      oldToNewRoutineId.set(impR.id, newId)
      return
    }

    // New routine
    const newId = uid()
    s.routines.push({
      id: newId,
      name: impR.name,
      emoji: impR.emoji || null,
      ex: (impR.ex || []).map(cleanRoutineExercise),
      _ts: Date.now()
    })
    oldToNewRoutineId.set(impR.id, newId)
  })

  // Folders integration
  if (importedFolders.length > 0) {
    importedFolders.forEach(impF => {
      const mappedRoutineIds = (impF.routineIds || [])
        .map(id => oldToNewRoutineId.get(id))
        .filter(Boolean)

      const fKey = impF.name.toLowerCase().trim()
      const existingF = existingFolderByName.get(fKey)

      if (existingF) {
        if (duplicateStrategy === 'replace') {
          existingF.routineIds = mappedRoutineIds
          existingF._ts = Date.now()
        } else if (duplicateStrategy === 'copy') {
          const newFId = 'f_' + uid()
          s.folders.push({
            id: newFId,
            name: `${impF.name} (Imported)`,
            routineIds: mappedRoutineIds,
            collapsed: false,
            _ts: Date.now()
          })
        } else {
          // skip: merge new routines into existing folder
          mappedRoutineIds.forEach(rId => {
            if (!existingF.routineIds.includes(rId)) existingF.routineIds.push(rId)
          })
        }
      } else {
        const newFId = 'f_' + uid()
        s.folders.push({
          id: newFId,
          name: impF.name,
          routineIds: mappedRoutineIds,
          collapsed: false,
          _ts: Date.now()
        })
      }
    })
  }

  // Schedule days merge if requested
  if (schedule && imported.week && typeof imported.week === 'object') {
    s.week = s.week || {}
    Object.entries(imported.week).forEach(([day, rIds]) => {
      const arr = Array.isArray(rIds) ? rIds : [rIds]
      s.week[day] = arr.map(id => oldToNewRoutineId.get(id)).filter(Boolean)
    })
  }

  s._ts = Date.now()
  return s
}
