"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

const CHECKOUT_GUARD_KEY = "crikket:billing:checkout-pending"
const CHECKOUT_GUARD_MAX_AGE_MS = 1000 * 60 * 45

interface SuccessPageGuardProps {
  checkoutId: string
}

function hasValidCheckoutGuard(): boolean {
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_GUARD_KEY)
    if (!raw) {
      return false
    }

    const parsed = JSON.parse(raw) as { createdAt?: unknown }
    if (typeof parsed.createdAt !== "number") {
      return false
    }

    const ageMs = Date.now() - parsed.createdAt
    return ageMs >= 0 && ageMs <= CHECKOUT_GUARD_MAX_AGE_MS
  } catch {
    return false
  }
}

export function SuccessPageGuard({ checkoutId }: SuccessPageGuardProps) {
  const router = useRouter()

  useEffect(() => {
    if (checkoutId.length === 0 || !hasValidCheckoutGuard()) {
      router.replace("/settings/organization")
      return
    }

    window.sessionStorage.removeItem(CHECKOUT_GUARD_KEY)
  }, [checkoutId, router])

  return null
}
