import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[var(--radius-button)] border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.3),0_2px_4px_rgba(0,0,0,0.15)] hover:brightness-110 active:brightness-95",
        outline:
          "border-white/[0.12] bg-white/[0.04] text-white hover:bg-white/[0.08] hover:text-white active:bg-white/[0.12] aria-expanded:bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
        secondary:
          "bg-white/[0.06] text-white hover:bg-white/[0.1] aria-expanded:bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
        ghost:
          "text-white/70 hover:bg-white/[0.06] hover:text-white aria-expanded:bg-white/[0.06]",
        destructive:
          "bg-red-500/10 text-red-400 hover:bg-red-500/20 focus-visible:border-red-500/40 focus-visible:ring-red-500/20 border-red-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-2 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1.5 rounded-[calc(var(--radius-button)-2px)] px-2.5 text-xs in-data-[slot=button-group]:rounded-[var(--radius-button)] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-[calc(var(--radius-button)-2px)] px-3 text-[0.8rem] in-data-[slot=button-group]:rounded-[var(--radius-button)] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-9",
        "icon-xs":
          "size-7 rounded-[calc(var(--radius-button)-2px)] in-data-[slot=button-group]:rounded-[var(--radius-button)] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-8 rounded-[calc(var(--radius-button)-2px)] in-data-[slot=button-group]:rounded-[var(--radius-button)]",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
