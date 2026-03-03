#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)

# shellcheck source=./lib/install-wizard.sh
source "${SCRIPT_DIR}/lib/install-wizard.sh"

main "$@"
