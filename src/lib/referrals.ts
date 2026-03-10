import prisma from "@/lib/prisma";

export async function getActiveReferralContext(referralCode: string) {
  return prisma.salesRepresentativeProfile.findUnique({
    where: { uniqueReferralCode: referralCode },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
        },
      },
    },
  });
}
