output "zone_id" {
  value       = data.cloudflare_zone.zedi.id
  description = "Cloudflare zone ID for zedi-note.app"
}

output "pages_production_name" {
  value       = cloudflare_pages_project.zedi.name
  description = "Cloudflare Pages production project name"
}

output "pages_development_name" {
  value       = cloudflare_pages_project.zedi_dev.name
  description = "Cloudflare Pages development project name"
}

output "pages_admin_name" {
  value       = cloudflare_pages_project.zedi_admin.name
  description = "Cloudflare Pages admin project name"
}

output "pages_dev_custom_domain" {
  value       = cloudflare_pages_domain.zedi_dev.domain
  description = "Custom domain for dev frontend (e.g. dev.zedi-note.app)"
}

output "pages_admin_custom_domain" {
  value       = cloudflare_pages_domain.zedi_admin.domain
  description = "Custom domain for admin frontend (e.g. admin.zedi-note.app)"
}
