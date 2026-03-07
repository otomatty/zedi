output "pages_development_name" {
  value       = cloudflare_pages_project.zedi_dev.name
  description = "Cloudflare Pages development project name"
}

output "pages_dev_custom_domain" {
  value       = cloudflare_pages_domain.zedi_dev.domain
  description = "Custom domain for dev frontend (e.g. dev.zedi-note.app)"
}
