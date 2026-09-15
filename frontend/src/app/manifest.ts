import type { MetadataRoute } from 'next'
export default function manifest(): MetadataRoute.Manifest {
  return { id:'/', name:'Assistente de mensagens', short_name:'Mensagens', start_url:'/messages', scope:'/', display:'standalone', background_color:'#ffffff', theme_color:'#ffffff', icons:[{src:'/app-icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}] }
}
