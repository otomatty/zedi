output "zone_id" {
  value       = data.cloudflare_zone.zedi.id
  description = "Cloudflare zone ID for zedi-note.app"
}

output "zone_domain" {
  value       = data.cloudflare_zone.zedi.name
  description = "Zone domain name"
}
