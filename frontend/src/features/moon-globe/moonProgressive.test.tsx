import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MOON_MODELS } from './asset'
import { __resetMoonCache } from './globeUtils'

// The real parser/renderer need WebGL; the progressive-loading logic is what is under test here.
const parsed: string[] = []
vi.mock('./loadMoon', () => ({
  parseMoon: vi.fn(async (_buf: ArrayBuffer, opts: { modelId: 'small' | 'topo' }) => {
    parsed.push(opts.modelId)
    const model = (await import('./asset')).MOON_MODELS[opts.modelId]
    return { modelId: opts.modelId, model, mesh: {}, textureSize: model.texturePx, surfaceMax: 1.01, surfaceRadiusAt: () => 1, lit: model.relief !== null, relief: model.relief ? 'true' : null, dispose: vi.fn() }
  }),
}))
vi.mock('./MoonScene', async () => {
  const { useEffect } = await import('react')
  return {
    default: function FakeScene({ moon, onReady }: { moon: { modelId: string }; onReady: () => void }) {
      useEffect(() => onReady(), [moon, onReady])
      return <div data-testid="fake-scene">{moon.modelId}</div>
    },
  }
})

const { MoonExplorer } = await import('./MoonExplorer')

function gpu(maxTexture: number) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ({ getParameter: () => maxTexture, getExtension: () => null, MAX_TEXTURE_SIZE: 0x0d33 }) as unknown as RenderingContext,
  )
}
const glb = (bytes = 64) => new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': 'model/gltf-binary', 'content-length': String(bytes) } })
const props = { sites: [], selectedId: null, onSelect: () => {}, command: null, onCommand: () => {} }

beforeEach(() => {
  parsed.length = 0
  __resetMoonCache()
  void i18n.changeLanguage('en')
  Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true })
})
afterEach(() => vi.restoreAllMocks())

describe('progressive High quality', () => {
  it('shows the lightweight globe first, then swaps in the NASA topographic model', async () => {
    gpu(16384)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => glb())
    render(<MoonExplorer {...props} />)
    expect(await screen.findByTestId('fake-scene')).toHaveTextContent('small')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0]![0]).toBe(MOON_MODELS.small.url)

    const select = screen.getByRole('combobox')
    const high = within(select).getByRole('option', { name: /High · NASA topographic model \(82 MB\)/ })
    expect(high).not.toBeDisabled()
    await userEvent.selectOptions(select, 'high')
    await waitFor(() => expect(screen.getByTestId('fake-scene')).toHaveTextContent('topo'))
    expect(fetchSpy.mock.calls.map((c) => c[0])).toContain(MOON_MODELS.topo.url)
    expect(parsed).toEqual(['small', 'topo'])
    // relief scale + display-light disclosure appear for the topographic model
    const relief = await screen.findByTestId('moon-relief')
    expect(within(relief).getByRole('radio', { name: 'True scale' })).toHaveAttribute('aria-checked', 'true')
    expect(within(relief).getByRole('radio', { name: /NASA ×2\.89 \(exaggerated\)/ })).toBeInTheDocument()
    expect(within(relief).getByText(/not the Sun/)).toBeInTheDocument()
  })

  it('keeps the standard globe and explains when the High model is not installed', async () => {
    gpu(16384)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url) === MOON_MODELS.small.url ? glb() : new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    )
    render(<MoonExplorer {...props} />)
    await screen.findByTestId('fake-scene')
    await userEvent.selectOptions(screen.getByRole('combobox'), 'high')
    const note = await screen.findByTestId('moon-upgrade')
    expect(within(note).getByText(/not installed/)).toBeInTheDocument()
    expect(within(note).getByText('npm run fetch:moon -- --high')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('standard'))
    expect(screen.getByTestId('fake-scene')).toHaveTextContent('small')
  })

  it('disables High on phones and GPUs without 8192 px textures; phones start on Reduced', async () => {
    gpu(4096)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => glb())
    const { unmount } = render(<MoonExplorer {...props} />)
    await screen.findByTestId('fake-scene')
    expect(within(screen.getByRole('combobox')).getByRole('option', { name: /desktop GPU needed/ })).toBeDisabled()
    unmount()

    __resetMoonCache()
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true })
    gpu(16384)
    render(<MoonExplorer {...props} />)
    await screen.findByTestId('fake-scene')
    expect(screen.getByRole('combobox')).toHaveValue('reduced')
    expect(within(screen.getByRole('combobox')).getByRole('option', { name: /High/ })).toBeDisabled()
  })
})
