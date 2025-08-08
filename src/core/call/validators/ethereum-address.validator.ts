import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isEthereumAddress', async: false })
export class IsEthereumAddressConstraint
  implements ValidatorConstraintInterface
{
  validate(value: any) {
    if (typeof value !== 'string') {
      return false;
    }

    // Ethereum address validation
    const ethereumAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    return ethereumAddressRegex.test(value);
  }

  defaultMessage() {
    return 'Invalid Ethereum address format';
  }
}

export function IsEthereumAddress(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsEthereumAddressConstraint,
    });
  };
}
