// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __dataHandlerCountForTests,
  __resetTerminalDataBusForTests,
  registerTerminalDataHandler,
  registerTerminalExitHandler,
} from './terminalDataBus'

describe('terminalDataBus', () => {
  let dataCb: ((id: string, data: string) => void) | null = null
  let exitCb: ((id: string, code: number) => void) | null = null

  beforeEach(() => {
    __resetTerminalDataBusForTests()
    dataCb = null
    exitCb = null
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      onTerminalData: (cb: (id: string, data: string) => void) => {
        dataCb = cb
        return () => { dataCb = null }
      },
      onTerminalExit: (cb: (id: string, code: number) => void) => {
        exitCb = cb
        return () => { exitCb = null }
      },
    }
  })

  afterEach(() => {
    __resetTerminalDataBusForTests()
  })

  it('installs a single IPC data listener and dispatches by ptyId', () => {
    const a = vi.fn()
    const b = vi.fn()
    const unA = registerTerminalDataHandler('pty-a', a)
    const unB = registerTerminalDataHandler('pty-b', b)

    expect(__dataHandlerCountForTests()).toBe(2)
    expect(dataCb).toBeTypeOf('function')

    dataCb!('pty-a', 'hello')
    dataCb!('pty-b', 'world')
    dataCb!('pty-missing', 'noop')

    expect(a).toHaveBeenCalledOnce()
    expect(a).toHaveBeenCalledWith('hello')
    expect(b).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledWith('world')

    unA()
    dataCb!('pty-a', 'gone')
    expect(a).toHaveBeenCalledOnce() // no further calls

    unB()
    expect(__dataHandlerCountForTests()).toBe(0)
    expect(dataCb).toBeNull() // listener torn down when empty
  })

  it('routes exit by ptyId', () => {
    const onExit = vi.fn()
    registerTerminalExitHandler('pty-x', onExit)
    exitCb!('pty-x', 7)
    exitCb!('other', 1)
    expect(onExit).toHaveBeenCalledOnce()
    expect(onExit).toHaveBeenCalledWith(7)
  })
})
