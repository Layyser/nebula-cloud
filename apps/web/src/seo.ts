export const origin = 'https://nubols.com'
export const pages: Record<string, [string, string]> = {
  '/': ['Nubols — Your AI agent’s own server', 'Give your AI agents a persistent Linux workspace. Deploy services, connect hooks, install software, and take control through the terminal.'],
  '/plans': ['Plans & pricing — Nubols', 'Explore Nubols plans for persistent AI workspaces and choose how your agents run.'],
  '/docs': ['Documentation — Nubols', 'Learn about Nubols workspaces, agents, hooks, capabilities, model providers, security, and the Runtime API.'],
  '/legal': ['Legal & security — Nubols', 'Read Nubols privacy, terms, acceptable use, cookies, and security documentation.'],
  '/contact': ['Contact — Nubols', 'Contact Nubols for product support, sales, partnerships, or security questions.'],
}
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
export function seoHead(path: string): string {
  const page = pages[path]
  const privatePage = /^\/(login|reset-password|invite|verify-email|auth\/callback(?:\/.*)?|app(?:\/.*)?)$/.test(path)
  const [title, description] = page ?? (privatePage ? ['Nubols — Workspace', 'Sign in to manage your Nubols workspace.'] : ['Page not found — Nubols', 'The requested page could not be found. Return to Nubols home.'])
  const url = origin + path
  const image = origin + '/nebula-top-squared.png'
  return `<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}" />
<meta name="robots" content="${page ? 'index,follow' : 'noindex,follow'}" />
${page ? `<link rel="canonical" href="${url}" />` : ''}
<meta property="og:type" content="website" /><meta property="og:site_name" content="Nubols" />
<meta property="og:title" content="${escape(title)}" /><meta property="og:description" content="${escape(description)}" />
<meta property="og:url" content="${escape(url)}" /><meta property="og:image" content="${image}" />
<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${escape(title)}" />
<meta name="twitter:description" content="${escape(description)}" /><meta name="twitter:image" content="${image}" />
${path === '/' ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization', '@id': origin + '/#organization', name: 'Nubols', url: origin, logo: image }, { '@type': 'WebSite', name: 'Nubols', url: origin, publisher: { '@id': origin + '/#organization' } }] })}</script>` : ''}`
}
export function updateSeo(path: string): void {
  document.head.querySelectorAll('[data-seo], title, meta[name="description"], meta[name="robots"], link[rel="canonical"], meta[property^="og:"], meta[name^="twitter:"], script[type="application/ld+json"]').forEach(node => node.remove())
  const template = document.createElement('template')
  template.innerHTML = seoHead(path)
  for (const node of Array.from(template.content.children)) { node.setAttribute('data-seo', ''); document.head.append(node) }
}
