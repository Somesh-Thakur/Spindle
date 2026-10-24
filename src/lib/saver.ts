import { create } from 'zustand'

/** Whether the screensaver is showing. Heavy visuals (AuraField) pause while it is. */
export const useSaver = create<{ on: boolean }>(() => ({ on: false }))

export const startSaver = () => useSaver.setState({ on: true })
