// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Workout from './Workout.jsx'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

vi.mock('../lib/sound.js', () => ({ beep: vi.fn(), vibrate: vi.fn(), alertBuzz: vi.fn(), unlock: vi.fn(), restOver: vi.fn() }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})), beacon: vi.fn() }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const clone = value => JSON.parse(JSON.stringify(value))

let root, container
beforeEach(() => {
  useUI.setState({ sheets: [], toastMsg: '', timer: null, work: null })
})
afterEach(() => {
  if (root) act(() => root.unmount())
  if (container) container.remove()
  root = container = null
})

function mountWorkout(initialUnit = 'kg', initialWeight = 100) {
  const S = clone(DEF)
  S.unit = initialUnit
  S.workoutView = 'list'
  S.active = {
    id: 'unit-test-session',
    d: '2026-10-25',
    start: Date.now(),
    routineId: null,
    name: 'Unit Toggle Workout',
    bw: null,
    cur: 0,
    entries: [
      {
        id: '0025', // Barbell Bench Press
        target: { sets: 1, reps: 8, mode: 'reps' },
        sets: [{ w: initialWeight, r: 8, done: false }],
      },
    ],
    workoutView: 'list',
  }
  useStore.setState({ S, user: null })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<MemoryRouter><Workout /></MemoryRouter>))
}

describe('Workout interface KG / LBS unit toggle', () => {
  it('renders KG and LBS unit toggle buttons in the workout interface', () => {
    mountWorkout('kg', 100)

    const kgBtns = container.querySelectorAll('.unit-btn')
    expect(kgBtns.length).toBeGreaterThan(0)

    const lbsBtn = container.querySelector('[data-testid="workout-unit-lbs"]')
    expect(lbsBtn).toBeTruthy()
    expect(lbsBtn.textContent).toBe('LBS')

    const kgBtn = container.querySelector('[data-testid="workout-unit-kg"]')
    expect(kgBtn).toBeTruthy()
    expect(kgBtn.textContent).toBe('KG')
    expect(kgBtn.classList.contains('active')).toBe(true)
  })

  it('switches unit to LBS, accurately converts 100 kg to 220.5 lbs, and updates header label', () => {
    mountWorkout('kg', 100)

    // Initial check
    expect(useStore.getState().S.unit).toBe('kg')
    expect(useStore.getState().S.active.entries[0].sets[0].w).toBe(100)
    const initialHead = container.querySelector('.sethead .w-sp').textContent
    expect(initialHead).toBe('Weight (kg)')

    // Click LBS
    const lbsBtn = container.querySelector('[data-testid="workout-unit-lbs"]')
    act(() => lbsBtn.click())

    // Verified store conversion
    expect(useStore.getState().S.unit).toBe('lb')
    expect(useStore.getState().S.active.entries[0].sets[0].w).toBe(220.5)

    // Verified header label
    const updatedHead = container.querySelector('.sethead .w-sp').textContent
    expect(updatedHead).toBe('Weight (lb)')
  })

  it('switches back from LBS to KG, converting 220.5 lbs back to 100 kg', () => {
    mountWorkout('lb', 220.5)

    expect(useStore.getState().S.unit).toBe('lb')
    expect(useStore.getState().S.active.entries[0].sets[0].w).toBe(220.5)

    // Click KG
    const kgBtn = container.querySelector('[data-testid="workout-unit-kg"]')
    act(() => kgBtn.click())

    expect(useStore.getState().S.unit).toBe('kg')
    expect(useStore.getState().S.active.entries[0].sets[0].w).toBe(100)
    expect(container.querySelector('.sethead .w-sp').textContent).toBe('Weight (kg)')
  })
})
