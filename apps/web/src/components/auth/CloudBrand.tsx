import { BrandLockup } from '../ui/CloudUI'

export function CloudBrand({
  onSelect,
}: {
  onSelect: () => void
}) {
  return <BrandLockup surface="cloud" onSelect={onSelect} />
}
