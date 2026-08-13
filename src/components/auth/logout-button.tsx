import { logoutAction } from "@/lib/auth/actions";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * A plain form post rather than an onClick handler: logging out is a mutation,
 * and this way it still works with JavaScript disabled.
 */
export function LogoutButton({ variant = "ghost", size = "sm", ...props }: ButtonProps) {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant={variant} size={size} {...props}>
        Log out
      </Button>
    </form>
  );
}
