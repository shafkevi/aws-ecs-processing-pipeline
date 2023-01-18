import { Construct } from "constructs";
import { Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { aws_ecs as ecs } from 'aws-cdk-lib';
import { aws_iam as iam } from 'aws-cdk-lib';
import { aws_autoscaling as autoscaling } from 'aws-cdk-lib';
import { aws_ecs_patterns as ecsPatterns } from 'aws-cdk-lib';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class AwsEcsProcessingPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);


    const vpc = new ec2.Vpc(this, `ProcessingVPC-${id}`, {
      cidr: "11.192.0.0/16",
      maxAzs: 2,
      // No Nat Gateways by default, but can easily change it here.
      natGateways: 0,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      /**
       * Each entry in this list configures a Subnet Group
       *
       * PRIVATE_ISOLATED: Isolated Subnets do not route traffic to the Internet (in this VPC).
       * PRIVATE_WITH_NAT.: Subnet that routes to the internet, but not vice versa.
       * PUBLIC..: Subnet connected to the Internet.
       */
      subnetConfiguration: [
        // {
        //   cidrMask: 24,
        //   name: 'nat',
        //   subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        // },
        {
          cidrMask: 24,
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        }, 
        {
          cidrMask: 24,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        }
      ],
    });

    const ec2Role = new iam.Role(this, 'MyRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    });

    // Need to figure out how to get this setup to boot the ECS Daemon on these instances.
    const launchTemplate = new ec2.LaunchTemplate(this, 'ASG-LaunchTemplate', {
      instanceType: new ec2.InstanceType('t3.nano'),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      userData: ec2.UserData.forLinux(),
      role: ec2Role,
    });

    const autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'ASG', {
      vpc,
      launchTemplate: launchTemplate,
    });

    const ecsCluster = new ecs.Cluster(this, `ecsCluster-${id}`, {
      vpc
    });

    const capacityProvider = new ecs.AsgCapacityProvider(this, 'AsgCapacityProvider', {
      capacityProviderName: `AsgCapacityProvider`,
      autoScalingGroup,
      machineImageType: ecs.MachineImageType.AMAZON_LINUX_2,
    });
    
    ecsCluster.addAsgCapacityProvider(capacityProvider);

    const queueProcessingEc2Service = new ecsPatterns.QueueProcessingEc2Service(this, 'Service', {
      cluster: ecsCluster,
      capacityProviderStrategies: [{
        capacityProvider: 'AsgCapacityProvider',
        weight: 1,
        // base: 1,
      }],
      memoryLimitMiB: 1024*32, // 32GB Memory
      gpuCount: 1, // 1 GPU
      cpu: 1024*8, // 8 vCPUs
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/b4m9p8f2/shafkevi-public:latest'),
      // command: ["-c", "4", "amazon.com"], // I don't need to override this.
      enableLogging: true,
      environment: {
        TEST_ENVIRONMENT_VARIABLE1: "test environment variable 1 value",
        TEST_ENVIRONMENT_VARIABLE2: "test environment variable 2 value",
      },
      maxScalingCapacity: 5,
      containerName: 'test', // don't need to add this.
    });

    
  }
}
