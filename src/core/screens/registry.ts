// The client's screens (spec/openCare.md §5.1 rule 5): each declared screen key (core.declare_screen) is drawn by the component
// registered under it — the base's four in screens/base.ts, a pack's in src/packs/<key>. A screen fills only the content of the
// department's frame: the tab row above it is the platform's, its toolbar is the kit's ScreenFrame. Pure: component types only.
import type { ComponentType } from 'react'
import type { Department } from '../db/types'

export interface ScreenProps { dept: Department }
const screens = new Map<string, ComponentType<ScreenProps>>()
/** a screen's component; a key is drawn by one component only (a second registration is refused) */
export function registerScreen(key: string, Screen: ComponentType<ScreenProps>) {
  if (screens.has(key)) { console.error(`openCare: the screen ${key} is taken`); return }
  screens.set(key, Screen)
}
export const screenFor = (key: string) => screens.get(key)
/** can this client draw the screen: a line may name one whose client code is not here */
export const drawable = (key: string) => screens.has(key)
