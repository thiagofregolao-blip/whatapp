// Conversations live only in the app installed on the phone; any browser tab
// (computer or phone) is limited to the connection page.
export function isPhone() {
  if (typeof window === 'undefined') return false
  return navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches
}
export function isInstalledPhoneApp() {
  if (typeof window === 'undefined') return false
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
  return standalone && isPhone()
}
