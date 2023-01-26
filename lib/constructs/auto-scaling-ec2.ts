import { Construct } from "constructs";
import { CfnOutput, Tags } from "aws-cdk-lib";
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { aws_iam as iam } from 'aws-cdk-lib';
import { aws_autoscaling as autoscaling } from 'aws-cdk-lib';
import { aws_ecs as ecs } from 'aws-cdk-lib';
import { Policy } from "aws-cdk-lib/aws-iam";

export interface AutoScalingEC2Props {
  name: string,
  vpc: ec2.Vpc,
  securityGroup: ec2.SecurityGroup,
  userDataCommands: string[],
  instanceType?: ec2.InstanceType,
  machineImage?: ec2.IMachineImage,
  minCapacity?: number,
  maxCapacity?: number,
}

export default class AutoScalingEC2 extends Construct {
  public readonly ec2Role: iam.Role;
  public autoScalingGroup: autoscaling.AutoScalingGroup;

  constructor(scope: Construct, id: string, props: AutoScalingEC2Props) {
    super(scope, id);

    const { 
      name,
      vpc,
      securityGroup,
      userDataCommands,
      instanceType,
      machineImage,
      minCapacity,
      maxCapacity,
    } = props;


    this.ec2Role = new iam.Role(this, 'MyRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });
    this.ec2Role.addManagedPolicy
    this.ec2Role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'));


    // Should really just turn this into a daemon, but for now this does the job.
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      ...userDataCommands
    );

    const launchTemplate = new ec2.LaunchTemplate(this, 'ASG-LaunchTemplate', {
      launchTemplateName: `LT-${name}`,
      instanceType: instanceType || new ec2.InstanceType('t3.small'),
      machineImage: machineImage || ecs.EcsOptimizedImage.amazonLinux2(),
      userData: userData,
      keyName: process.env.KEY_NAME || 'shafkevi',
      role: this.ec2Role,
      securityGroup: securityGroup,
    });

    this.autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'ASG', {
      autoScalingGroupName: `ASG-${name}`,
      vpc,
      groupMetrics: [autoscaling.GroupMetrics.all()],
      vpcSubnets: {
        // Use any public subnet,
        subnetType: ec2.SubnetType.PUBLIC,
        // Use these specific subnets
        // subnets: vpc.publicSubnets,
      },
      launchTemplate: launchTemplate,
      minCapacity: minCapacity || 1,
      maxCapacity: maxCapacity || 5,
    });
    /* Allows EC2 instances to update their own autoscaling protection policy */
    this.ec2Role.attachInlinePolicy(new Policy(this, 'UpdateScalingProtectionPolicy', {
      statements: [
        new iam.PolicyStatement({
          actions: ['autoscaling:SetInstanceProtection'],
          resources: [this.autoScalingGroup.autoScalingGroupArn],
        }),
        new iam.PolicyStatement({
          actions: ['autoscaling:DescribeAutoScalingInstances'],
          resources: ["*"],
        }),
    ],
    }))

    Tags.of(this.autoScalingGroup).add('appName', name);

  }
}