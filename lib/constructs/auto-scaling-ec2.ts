import { Construct } from "constructs";
import { CfnOutput } from "aws-cdk-lib";
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { aws_iam as iam } from 'aws-cdk-lib';
import { aws_autoscaling as autoscaling } from 'aws-cdk-lib';
import { aws_ecs as ecs } from 'aws-cdk-lib';

export interface AutoScalingEC2Props {
  vpc: ec2.Vpc,
  userDataCommands: string[],
}

export default class AutoScalingEC2 extends Construct {
  public readonly ec2Role: iam.Role;
  public autoScalingGroup: autoscaling.AutoScalingGroup;

  constructor(scope: Construct, id: string, props: AutoScalingEC2Props) {
    super(scope, id);

    const { 
      vpc,
      userDataCommands,
    } = props;


    this.ec2Role = new iam.Role(this, 'MyRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });



    // Should really just turn this into a daemon, but for now this does the job.
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      ...userDataCommands
    );

    const launchTemplate = new ec2.LaunchTemplate(this, 'ASG-LaunchTemplate', {
      instanceType: new ec2.InstanceType('t3.small'),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      userData: userData,
      keyName: process.env.KEY_NAME || 'shafkevi',
      role: this.ec2Role,
    });

    this.autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'ASG', {
      vpc,
      groupMetrics: [autoscaling.GroupMetrics.all()],
      vpcSubnets: {
        // Use any public subnet,
        subnetType: ec2.SubnetType.PUBLIC,
        // Use these specific subnets
        // subnets: vpc.publicSubnets,
      },
      launchTemplate: launchTemplate,
      minCapacity: 1,
      maxCapacity: 5,
    });

  }
}