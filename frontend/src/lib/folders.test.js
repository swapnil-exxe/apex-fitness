import { describe, it, expect } from 'vitest'
import {
  ensureFolders,
  getFolders,
  getRoutinesInFolder,
  createFolder,
  renameFolder,
  deleteFolder,
  addRoutineToFolder,
  moveRoutineBetweenFolders,
  reorderRoutinesInFolder,
  reorderFolders,
  toggleFolderCollapsed,
  setActiveProgram,
  duplicateFolder
} from './folders.js'

describe('Workout Program Folders & Collections (folders.js)', () => {
  const sampleRoutines = [
    { id: 'r_push_a', name: 'Monday — Push A', ex: [] },
    { id: 'r_pull_a', name: 'Tuesday — Pull A', ex: [] },
    { id: 'r_legs_a', name: 'Wednesday — Legs A', ex: [] },
    { id: 'r_push_b', name: 'Thursday — Push B', ex: [] },
    { id: 'r_pull_b', name: 'Friday — Pull B', ex: [] },
    { id: 'r_legs_b', name: 'Saturday — Legs B', ex: [] }
  ]

  it('migrates existing routines safely into a default program without duplicating or dropping anything', () => {
    const S = { routines: sampleRoutines }
    const res = ensureFolders(S)

    expect(res.folders).toHaveLength(1)
    expect(res.folders[0].name).toBe('My Workout Program')
    expect(res.folders[0].routineIds).toHaveLength(6)
    expect(res.folders[0].routineIds).toEqual(['r_push_a', 'r_pull_a', 'r_legs_a', 'r_push_b', 'r_pull_b', 'r_legs_b'])
    expect(res.activeFolderId).toBe(res.folders[0].id)
  })

  it('creates new folders, renames them, and allows empty folders', () => {
    const s = ensureFolders({ routines: [...sampleRoutines] })
    const newF = createFolder(s, { name: 'Upper / Lower' })

    expect(s.folders).toHaveLength(2)
    expect(newF.name).toBe('Upper / Lower')
    expect(newF.routineIds).toEqual([])

    renameFolder(s, newF.id, 'Upper / Lower Split')
    expect(s.folders[1].name).toBe('Upper / Lower Split')
  })

  it('moves routines between folders cleanly', () => {
    const s = ensureFolders({ routines: [...sampleRoutines] })
    const f2 = createFolder(s, { name: 'Second Program' })
    const defaultFolder = s.folders[0]

    expect(defaultFolder.routineIds).toContain('r_push_a')
    expect(f2.routineIds).not.toContain('r_push_a')

    moveRoutineBetweenFolders(s, 'r_push_a', defaultFolder.id, f2.id)

    expect(defaultFolder.routineIds).not.toContain('r_push_a')
    expect(f2.routineIds).toContain('r_push_a')
    expect(getRoutinesInFolder(s, f2.id)).toHaveLength(1)
    expect(getRoutinesInFolder(s, f2.id)[0].name).toBe('Monday — Push A')
  })

  it('reorders routines in a folder and reorders folders', () => {
    const s = ensureFolders({ routines: [...sampleRoutines] })
    const f = s.folders[0]

    expect(f.routineIds[0]).toBe('r_push_a')
    expect(f.routineIds[1]).toBe('r_pull_a')

    reorderRoutinesInFolder(s, f.id, 0, 1)
    expect(f.routineIds[0]).toBe('r_pull_a')
    expect(f.routineIds[1]).toBe('r_push_a')

    createFolder(s, { name: 'Folder 2' })
    expect(s.folders[0].name).toBe('My Workout Program')
    expect(s.folders[1].name).toBe('Folder 2')

    reorderFolders(s, 0, 1)
    expect(s.folders[0].name).toBe('Folder 2')
    expect(s.folders[1].name).toBe('My Workout Program')
  })

  it('duplicates an entire program with all its routines duplicated with new IDs', () => {
    const s = ensureFolders({ routines: [...sampleRoutines] })
    const fId = s.folders[0].id
    const origRoutineCount = s.routines.length

    const dup = duplicateFolder(s, fId, 'Clone')

    expect(dup).toBeTruthy()
    expect(dup.name).toContain('Clone')
    expect(dup.routineIds).toHaveLength(6)
    // Duplicated routines added to S.routines
    expect(s.routines).toHaveLength(origRoutineCount + 6)
    // IDs are brand new
    expect(dup.routineIds[0]).not.toBe(sampleRoutines[0].id)
  })

  it('sets active program and toggles collapsed state', () => {
    const s = ensureFolders({ routines: [...sampleRoutines] })
    const f2 = createFolder(s, { name: 'PPL Pro' })

    expect(s.activeFolderId).toBe(s.folders[0].id)
    setActiveProgram(s, f2.id)
    expect(s.activeFolderId).toBe(f2.id)
    expect(f2.active).toBe(true)
    expect(s.folders[0].active).toBe(false)

    expect(f2.collapsed).toBe(false)
    toggleFolderCollapsed(s, f2.id)
    expect(f2.collapsed).toBe(true)
  })

  it('deletes folder safely without losing routines when targetFolderId is provided', () => {
    const s = ensureFolders({ routines: [...sampleRoutines] })
    const f1 = s.folders[0]
    const f2 = createFolder(s, { name: 'Target Folder' })

    expect(s.folders).toHaveLength(2)
    deleteFolder(s, f1.id, { deleteRoutines: false, targetFolderId: f2.id })

    expect(s.folders).toHaveLength(1)
    expect(s.folders[0].id).toBe(f2.id)
    // All 6 routines safely preserved in target folder
    expect(s.folders[0].routineIds).toEqual(['r_push_a', 'r_pull_a', 'r_legs_a', 'r_push_b', 'r_pull_b', 'r_legs_b'])
    expect(s.routines).toHaveLength(6)
  })
})
