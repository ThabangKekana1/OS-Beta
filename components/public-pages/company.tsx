import React from 'react';
import { SingleSection, DoubleSection, CarouselSection, LandingContainer } from '@/components/landing/LandingSections';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Company | 1OS',
    description: 'Learn about 1OS, the South African energy infrastructure company building commercial solar, energy-as-a-service, and long-term power systems.',
    alternates: {
        canonical: '/company',
    },
};

export default function CompanyPage() {
    return (
        <LandingContainer>
            {/* HERO - Single */}
            <SingleSection
                item={{
                    title: 'Architecture of the Future.\nPowering Humanity.',
                    description: "1OS is the infrastructure layer for South Africa's next century. We don't just build energy solutions; we architect the foundation of progress.",
                    link: '/contact',
                    linkText: 'Partner with us',
                    buttonTheme: 'lightPanelGlassWhite',
                    bgColor: '#0b0b0b',
                    textColor: '#ffffff',
                    image: '/company-hero.png'
                }}
            />

            {/* VISION & MISSION - Double */}
            <DoubleSection
                items={[
                    {
                        title: 'The Vision',
                        description: 'Accelerating the Republic\u2019s transition to a high-growth civilization where scarcity is replaced by renewable abundance.',
                        image: '/company-vision.jpg'
                    },
                    {
                        title: 'The Mission',
                        description: 'To eliminate the energy bottleneck through institutional-scale infrastructure and zero-friction deployment.',
                        image: '/company-mission.jpg'
                    }
                ]}
            />

            {/* COMMITMENTS - Carousel */}
            <CarouselSection
                title="Core Commitments."
                items={[
                    {
                        tag: 'Commitment 01',
                        title: 'Renewable Sovereignty',
                        description: 'True freedom starts with energy independence. We are committed to a South Africa powered by its own sunlight, creating a decoupled and resilient economy.',
                        cardBg: '#ffff80',
                        image: '/renewable-sovereignty.jpg'
                    },
                    {
                        tag: 'Commitment 02',
                        title: 'Economic Scaling',
                        description: 'Solar energy is the first step toward a post-scarcity future. We build infrastructure that turns a variable operational cost into a fixed, declining asset.',
                        cardBg: '#ffb3ff',
                        image: '/economic-scaling.jpg'
                    },
                    {
                        tag: 'Commitment 03',
                        title: 'Infinite Scalability',
                        description: 'As more nodes join the 1OS network, the entire system becomes more robust, efficient, and capable of supporting national demand.',
                        cardBg: '#80d4ff',
                        image: '/infinite-scale.png'
                    }
                ]}
            />

            {/* FINAL CTA - Single */}
            <SingleSection
                item={{
                    title: 'Building the Foundation.',
                    description: 'Join us as we architect the renewable and intelligent future of the South African Republic. The revolution is already underway.',
                    link: '/contact',
                    linkText: 'Partner with us',
                    buttonTheme: 'lightPanelGlass',
                    bgColor: '#f1f1f1',
                    textColor: '#000000',
                    image: '/company-cta.jpg'
                }}
            />
        </LandingContainer>
    );
}
