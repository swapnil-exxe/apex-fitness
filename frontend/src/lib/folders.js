import { uid } from './format.js'
import { copyRoutine, deleteRoutine } from './routines.js'

/**
 * Ensures that `S` has a valid `folders` array and `activeFolderId`.
 * Any existing routines without a folder are assigned to the default folder,
 * preserving all existing routines, plans, schedules, and history without duplicates.
 */
export function ensureFolders(S) {
  if (!S || typeof S !== 'object') return S
  const routines = Array.isArray(S.routines) ? S.routines : []
  let folders = Array.isArray(S.folders) ? [...S.folders] : []
  let activeFolderId = S.activeFolderId || null

  // If no folders exist at all, create an initial program folder containing all existing routines
  if (folders.length === 0) {
    const defaultFolderId = 'f_default'
    const defaultFolder = {
      id: defaultFolderId,
      name: 'My Workout Program',
      routineIds: routines.map(r => r.id),
      collapsed: false,
      active: true,
      _ts: Date.now()
    }
    folders = [defaultFolder]
    activeFolderId = defaultFolderId
  }

  // Ensure activeFolderId is valid
  if (!activeFolderId || !folders.some(f => f.id === activeFolderId)) {
    activeFolderId = folders[0].id
  }

  // Track all routine IDs that are assigned to any folder
  const assignedRoutineIds = new Set()
  folders.forEach(f => {
    f.routineIds = Array.isArray(f.routineIds) ? f.routineIds.filter(id => routines.some(r => r.id === id)) : []
    f.routineIds.forEach(id => assignedRoutineIds.add(id))
  })

  // Any routine in S.routines that is NOT in any folder gets added to the active or first folder
  const unassignedRoutines = routines.filter(r => !assignedRoutineIds.has(r.id))
  if (unassignedRoutines.length > 0) {
    const targetFolder = folders.find(f => f.id === activeFolderId) || folders[0]
    unassignedRoutines.forEach(r => {
      if (!targetFolder.routineIds.includes(r.id)) {
        targetFolder.routineIds.push(r.id)
      }
    })
  }

  return {
    ...S,
    folders,
    activeFolderId
  }
}

/**
 * Get the list of folders with ensured integrity.
 */
export function getFolders(S) {
  return ensureFolders(S).folders
}

/**
 * Get routines for a specific folder in order.
 */
export function getRoutinesInFolder(S, folderId) {
  const safeS = ensureFolders(S)
  const folder = safeS.folders.find(f => f.id === folderId)
  if (!folder) return []
  const routineMap = new Map((safeS.routines || []).map(r => [r.id, r]))
  return (folder.routineIds || []).map(id => routineMap.get(id)).filter(Boolean)
}

/**
 * Create a new folder (program/collection).
 */
export function createFolder(s, { name, routineIds = [] }) {
  const safe = ensureFolders(s)
  s.folders = safe.folders
  s.activeFolderId = safe.activeFolderId

  const newFolder = {
    id: 'f_' + uid(),
    name: (name || 'New Program').trim(),
    routineIds: Array.isArray(routineIds) ? routineIds : [],
    collapsed: false,
    _ts: Date.now()
  }

  s.folders.push(newFolder)
  return newFolder
}

/**
 * Rename a folder.
 */
export function renameFolder(s, folderId, newName) {
  const safe = ensureFolders(s)
  s.folders = safe.folders
  const folder = s.folders.find(f => f.id === folderId)
  if (!folder) return false
  folder.name = (newName || folder.name).trim()
  folder._ts = Date.now()
  return true
}

/**
 * Delete a folder.
 * If `deleteRoutines` is true, deletes all routines inside the folder.
 * Otherwise, moves routines to `targetFolderId` (or the default folder).
 */
export function deleteFolder(s, folderId, { deleteRoutines = false, targetFolderId = null } = {}) {
  const safe = ensureFolders(s)
  s.folders = safe.folders
  s.activeFolderId = safe.activeFolderId

  // Cannot delete the only remaining folder
  if (s.folders.length <= 1) {
    return false
  }

  const folderIndex = s.folders.findIndex(f => f.id === folderId)
  if (folderIndex < 0) return false

  const [removedFolder] = s.folders.splice(folderIndex, 1);

  if (deleteRoutines) {
    const rIds = removedFolder.routineIds || [];
    rIds.forEach(rId => {
      deleteRoutine(s, rId);
    });
  } else {
    const dest = s.folders.find(f => f.id === targetFolderId) || s.folders[0];
    const rIds = removedFolder.routineIds || [];
    rIds.forEach(rId => {
      if (!dest.routineIds.includes(rId)) {
        dest.routineIds.push(rId);
      }
    });
    dest._ts = Date.now();
  }

  // If deleted folder was active, switch active to the first folder
  if (s.activeFolderId === folderId) {
    s.activeFolderId = s.folders[0].id
  }

  return true
}

/**
 * Add a routine to a folder.
 */
export function addRoutineToFolder(s, folderId, routineId) {
  const safe = ensureFolders(s)
  s.folders = safe.folders
  const folder = s.folders.find(f => f.id === folderId)
  if (!folder) return false
  if (!folder.routineIds.includes(routineId)) {
    folder.routineIds.push(routineId)
    folder._ts = Date.now()
  }
  return true
}

/**
 * Move a routine from one folder to another.
 */
export function moveRoutineBetweenFolders(s, routineId, fromFolderId, toFolderId, targetIndex = null) {
  const safe = ensureFolders(s)
  s.folders = safe.folders
  const fromFolder = s.folders.find(f => f.id === fromFolderId)
  const toFolder = s.folders.find(f => f.id === toFolderId)
  if (!fromFolder || !toFolder) return false

  // Remove from source
  fromFolder.routineIds = fromFolder.routineIds.filter(id => id !== routineId)
  fromFolder._ts = Date.now()

  // Insert into destination
  if (targetIndex != null && targetIndex >= 0 && targetIndex <= toFolder.routineIds.length) {
    toFolder.routineIds.splice(targetIndex, 0, routineId)
  } else if (!toFolder.routineIds.includes(routineId)) {
    toFolder.routineIds.push(routineId)
  }
  toFolder._ts = Date.now()
  return true
}

/**
 * Reorder routines within a folder.
 */
export function reorderRoutinesInFolder(s, folderId, fromIndex, toIndex) {
  const safe = ensureFolders(s)
  s.folders = safe.folders
  const folder = s.folders.find(f => f.id === folderId)
  if (!folder || !Array.isArray(folder.routineIds)) return false
  if (fromIndex < 0 || fromIndex >= folder.routineIds.length) return false
  if (toIndex < 0 || toIndex >= folder.routineIds.length) return false

  const [movedId] = folder.routineIds.splice(fromIndex, 1)
  folder.routineIds.splice(toIndex, 0, movedId)
  folder._ts = Date.now()
  return true
}

/**
 * Reorder folders themselves.
 */
export function reorderFolders(s, fromIndex, toIndex) {
  const safe = ensureFolders(s)
  s.folders = safe.folders
  if (fromIndex < 0 || fromIndex >= s.folders.length) return false
  if (toIndex < 0 || toIndex >= s.folders.length) return false

  const [movedFolder] = s.folders.splice(fromIndex, 1)
  s.folders.splice(toIndex, 0, movedFolder)
  return true
}

/**
 * Toggle collapsed state of a folder.
 */
export function toggleFolderCollapsed(s, folderId) {
  const safe = ensureFolders(s)
  s.folders = safe.folders
  const folder = s.folders.find(f => f.id === folderId)
  if (!folder) return false
  folder.collapsed = !folder.collapsed
  return true
}

/**
 * Set the active workout program / folder.
 */
export function setActiveProgram(s, folderId) {
  const safe = ensureFolders(s)
  s.folders = safe.folders
  if (!s.folders.some(f => f.id === folderId)) return false
  s.activeFolderId = folderId

  // Mark active on folders
  s.folders.forEach(f => {
    f.active = f.id === folderId
  })
  return true
}

/**
 * Duplicate an entire workout program / folder.
 * All routines inside it are deep-copied with new IDs and added to the store.
 */
export function duplicateFolder(s, folderId, copySuffix = 'Copy') {
  const safe = ensureFolders(s)
  s.folders = safe.folders
  const sourceFolder = s.folders.find(f => f.id === folderId)
  if (!sourceFolder) return null

  const routineMap = new Map((s.routines || []).map(r => [r.id, r]));
  const newRoutineIds = [];
  const sourceRIds = sourceFolder.routineIds || [];

  sourceRIds.forEach(rId => {
    const origRoutine = routineMap.get(rId);
    if (origRoutine) {
      const cloned = copyRoutine(origRoutine, copySuffix);
      s.routines.push(cloned);
      newRoutineIds.push(cloned.id);
    }
  });

  const newFolder = {
    id: 'f_' + uid(),
    name: `${sourceFolder.name} (${copySuffix})`,
    routineIds: newRoutineIds,
    collapsed: false,
    _ts: Date.now()
  }

  const sourceIndex = s.folders.indexOf(sourceFolder)
  s.folders.splice(sourceIndex + 1, 0, newFolder)
  return newFolder
}
