// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditProfileSheet } from './ProfileSheet.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const store = {
    user: { id: 'usr_test123', name: 'Swapnil Athlete', email: 'swapnil15x@gmail.com', admin: false },
    setDisplayName: vi.fn(),
  }
  const ui = {
    toast: vi.fn(),
    openSheet: vi.fn(),
  }
  return { store, ui }
})

vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.store) : mocks.store
  useStore.getState = () => mocks.store
  return { useStore }
})

vi.mock('../store/useUI.js', () => {
  const useUI = selector => selector ? selector(mocks.ui) : mocks.ui
  useUI.getState = () => mocks.ui
  return { useUI }
})

vi.mock('../lib/api.js', () => ({
  updateDisplayName: vi.fn(async (name) => ({ id: 'usr_test123', name }))
}))

describe('ProfileSheet', () => {
  let container
  let root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mocks.store.user = { id: 'usr_test123', name: 'Swapnil Athlete', email: 'swapnil15x@gmail.com', admin: false }
    vi.clearAllMocks()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('renders avatar initial, current display name and account details', () => {
    act(() => {
      root.render(<EditProfileSheet close={vi.fn()} />)
    })
    expect(container.textContent).toContain('Edit Profile')
    expect(container.textContent).toContain('swapnil15x@gmail.com')
    expect(container.textContent).toContain('usr_test123')
    const input = container.querySelector('input[type="text"]')
    expect(input).not.toBeNull()
    expect(input.value).toBe('Swapnil Athlete')
  })

  it('updates display name, calls API and closes sheet on submit', async () => {
    const close = vi.fn()
    act(() => {
      root.render(<EditProfileSheet close={close} />)
    })

    const input = container.querySelector('input[type="text"]')
    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      nativeInputValueSetter.call(input, 'Swapnil Pro')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const form = container.querySelector('form')
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    const api = await import('../lib/api.js')
    expect(api.updateDisplayName).toHaveBeenCalledWith('Swapnil Pro')
    expect(mocks.store.setDisplayName).toHaveBeenCalledWith('Swapnil Pro')
    expect(mocks.ui.toast).toHaveBeenCalledWith('Display name updated')
    expect(close).toHaveBeenCalled()
  })
})
