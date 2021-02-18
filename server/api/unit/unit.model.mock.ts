import { uniqueString } from '../../util/test-utils/unique';
import { Org } from '../org/org.model';
import { Unit } from './unit.model';

export async function seedUnit(org: Org) {
  const unit = Unit.create({
    org,
    name: uniqueString(),
    musterConfiguration: [],
  });
  return unit.save();
}
