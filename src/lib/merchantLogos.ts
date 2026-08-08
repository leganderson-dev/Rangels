const merchantLogos = [
  { pattern: /paypal/, path: '/merchant-logos/paypal.png', name: 'PayPal' },
  { pattern: /netflix/, path: '/merchant-logos/netflix.png', name: 'Netflix' },
  { pattern: /\bapple\b|itunes/, path: '/merchant-logos/apple.png', name: 'Apple' },
  { pattern: /translink/, path: '/merchant-logos/translink.png', name: 'Translink' },
  { pattern: /\blinkt\b/, path: '/merchant-logos/linkt.png', name: 'Linkt' },
  { pattern: /allianz/, path: '/merchant-logos/allianz.png', name: 'Allianz' },
  { pattern: /woolworths/, path: '/merchant-logos/woolworths.png', name: 'Woolworths' },
  { pattern: /amazon/, path: '/merchant-logos/amazon.png', name: 'Amazon' },
  { pattern: /bunnings/, path: '/merchant-logos/bunnings.png', name: 'Bunnings' },
  { pattern: /telstra/, path: '/merchant-logos/telstra.png', name: 'Telstra' },
] as const

export function merchantLogo(key: string, name: string) {
  const candidate = `${key} ${name}`.toLocaleLowerCase()
  return merchantLogos.find(logo => logo.pattern.test(candidate)) ?? null
}
