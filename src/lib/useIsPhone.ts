import { useEffect, useState } from 'react'

const QUERY = '(max-width: 860px)'

export function useIsPhone() {
  const [phone, setPhone] = useState(() => matchMedia(QUERY).matches)
  useEffect(() => {
    const m = matchMedia(QUERY)
    const on = () => setPhone(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return phone
}
