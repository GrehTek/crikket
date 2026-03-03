#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)

# shellcheck source=./lib/selfhost-common.sh
source "${SCRIPT_DIR}/lib/selfhost-common.sh"

main() {
  ensure_selfhost_layout
  ensure_docker_access
  load_selfhost_mode

  if ! is_bundled_postgres; then
    die "DATABASE_URL does not point at the bundled postgres service. Use your external database provider's backup tooling instead."
  fi

  local backup_dir output_file postgres_user postgres_db
  backup_dir="${ROOT_DIR}/backups/postgres"
  output_file="${backup_dir}/crikket-$(date +%Y%m%d-%H%M%S).sql"
  postgres_user="$(default_value "$ROOT_ENV_FILE" "POSTGRES_USER" "postgres")"
  postgres_db="$(default_value "$ROOT_ENV_FILE" "POSTGRES_DB" "crikket")"

  mkdir -p "$backup_dir"

  info "Writing PostgreSQL backup to ${output_file}"
  compose_run exec -T postgres pg_dump -U "$postgres_user" "$postgres_db" >"$output_file"
  info "Backup completed."
}

main "$@"
