import { Lock, Crown } from 'lucide-react';
import { Button } from '../ui/button';
import { usePlanRestrictions, type FeatureName } from '../../hooks/usePlanRestrictions';
import { useNavigate } from 'react-router';

/** Botón que se bloquea solo si el motor comercial real (mi_licencia_vigente
 *  + mis_entitlements, vía usePlanRestrictions) dice que el plan actual no
 *  incluye esta función -- nunca decide localmente. */
export function PremiumButton({
  feature,
  onClick,
  children,
  className = '',
  disabled = false,
  ...props
}: {
  feature: FeatureName;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  [key: string]: any;
}) {
  const { hasFeature, getRestrictionMessage } = usePlanRestrictions();
  const navigate = useNavigate();

  const isBlocked = !hasFeature(feature);

  if (isBlocked) {
    return (
      <Button
        onClick={() => navigate('/configuracion')}
        className={`relative ${className}`}
        disabled={disabled}
        title={getRestrictionMessage(feature)}
        {...props}
      >
        <Lock className="w-4 h-4 mr-2" />
        {children}
        <Crown className="w-4 h-4 ml-2 text-amber-400" />
      </Button>
    );
  }

  return (
    <Button onClick={onClick} className={className} disabled={disabled} {...props}>
      {children}
    </Button>
  );
}
