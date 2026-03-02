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
