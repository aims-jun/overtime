export type VerifiedGoogleIdentity = {
  subject: string;
  email: string;
  name: string;
  pictureUrl?: string;
  hostedDomain: string;
};

export abstract class GoogleVerifier {
  abstract verify(credential: string): Promise<VerifiedGoogleIdentity>;
}
