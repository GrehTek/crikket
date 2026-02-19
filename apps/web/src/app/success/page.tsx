import { authClient } from "@crikket/auth/client"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@crikket/ui/components/ui/card"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { SuccessActions } from "./_components/success-actions"
import { SuccessPageGuard } from "./_components/success-page-guard"

export const metadata: Metadata = {
  title: "Checkout Success",
  description: "Your checkout has been completed successfully.",
}

interface SuccessPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

function readCheckoutId(
  checkoutIdParam: string | string[] | undefined
): string | null {
  if (Array.isArray(checkoutIdParam)) {
    return checkoutIdParam[0] ?? null
  }

  if (typeof checkoutIdParam === "string" && checkoutIdParam.length > 0) {
    return checkoutIdParam
  }

  return null
}

export default async function SuccessPage({ searchParams }: SuccessPageProps) {
  const resolvedSearchParams = await searchParams
  const checkoutId = readCheckoutId(resolvedSearchParams.checkout_id)
  const requestHeaders = await headers()
  const { data: session } = await authClient.getSession({
    fetchOptions: {
      headers: requestHeaders,
    },
  })

  if (!session) {
    const callbackURL = checkoutId
      ? `/success?checkout_id=${encodeURIComponent(checkoutId)}`
      : "/success"
    redirect(`/login?callbackURL=${encodeURIComponent(callbackURL)}`)
  }

  if (!checkoutId) {
    redirect("/settings/organization")
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <SuccessPageGuard checkoutId={checkoutId} />
      <Card className="w-full max-w-[560px] shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl tracking-tight">
            Checkout complete
          </CardTitle>
          <CardDescription>
            Your payment was submitted successfully. It can take a few moments
            for your updated plan to appear.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm">
            <span className="font-medium">Checkout ID:</span>{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              {checkoutId}
            </code>
          </p>

          <SuccessActions />
        </CardContent>
      </Card>
    </main>
  )
}
